// SPDX-License-Identifier: MIT
// Credit to etherspot-prime-contracts repo at https://github.com/etherspot/etherspot-prime-contracts/tree/master
pragma solidity ^0.8.12;

/* solhint-disable reason-string */

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./BasePaymaster.sol";

/**
 * A sample paymaster that uses external service to decide whether to pay for the UserOp.
 * The paymaster trusts an external signer to sign the transaction.
 * The calling user must pass the UserOp to that external signer first, which performs
 * whatever off-chain verification before signing the UserOp.
 * Note that this signature is NOT a replacement for wallet signature:
 * - the paymaster signs to agree to PAY for GAS.
 * - the wallet signs to prove identity and account ownership.
 */
contract EtherspotPaymaster is BasePaymaster, ReentrancyGuard {
    using ECDSA for bytes32;
    using UserOperationLib for UserOperation;

    uint256 private constant SPONSOR_ADDRESS_OFFSET = 20;
    //uint256 private constant VALID_TIMESTAMP_OFFSET = 52; // each abi.encode is 32bytes
    uint256 private constant SIGNATURE_OFFSET = 116; // 20 + 1 * 32 + 2 * 32
    // calculated cost of the postOp
    uint256 private constant COST_OF_POST = 40000;

    address private verifyingSignerAddress;

    mapping(address => uint256) private _sponsorBalances;

    event SponsorSuccessful(address paymaster, address sender);

    constructor(
        IEntryPoint _entryPoint,
        address _verifyingSignerAddress
    ) BasePaymaster(_entryPoint) {
        verifyingSignerAddress = _verifyingSignerAddress;
    }

    function setVerifyingSigner(
        address _newVerifyingSignerAddress
    ) external onlyOwner {
        verifyingSignerAddress = _newVerifyingSignerAddress;
    }

    function depositFunds() external payable nonReentrant {
        _creditSponsor(msg.sender, msg.value);
        entryPoint.depositTo{value: msg.value}(address(this));
    }

    function withdrawFunds(uint256 _amount) external nonReentrant {
        require(
            getSponsorBalance(msg.sender) >= _amount,
            "EtherspotPaymaster:: not enough deposited funds"
        );
        _debitSponsor(msg.sender, _amount);
        entryPoint.withdrawTo(payable(msg.sender), _amount);
    }

    function getSponsorBalance(address _sponsor) public view returns (uint256) {
        return _sponsorBalances[_sponsor];
    }

    function _debitSponsor(address _sponsor, uint256 _amount) internal {
        _sponsorBalances[_sponsor] -= _amount;
    }

    function _creditSponsor(address _sponsor, uint256 _amount) internal {
        _sponsorBalances[_sponsor] += _amount;
    }

    function _pack(
        UserOperation calldata userOp
    ) internal pure returns (bytes32) {
        return
            keccak256(
                abi.encode(
                    userOp.getSender(),
                    userOp.nonce,
                    keccak256(userOp.initCode),
                    keccak256(userOp.callData),
                    userOp.callGasLimit,
                    userOp.verificationGasLimit,
                    userOp.preVerificationGas,
                    userOp.maxFeePerGas,
                    userOp.maxPriorityFeePerGas
                )
            );
    }

    /**
     * return the hash we're going to sign off-chain (and validate on-chain)
     * this method is called by the off-chain service, to sign the request.
     * it is called on-chain from the validatePaymasterUserOp, to validate the signature.
     * note that this signature covers all fields of the UserOperation, except the "paymasterAndData",
     * which will carry the signature itself.
     */
    function getHash(
        UserOperation calldata userOp,
        address sponsorAddress,
        uint48 validUntil,
        uint48 validAfter
    ) public view returns (bytes32) {
        //can't use userOp.hash(), since it contains also the paymasterAndData itself.

        return
            keccak256(
                abi.encode(
                    _pack(userOp),
                    block.chainid,
                    address(this),
                    sponsorAddress,
                    validUntil,
                    validAfter
                )
            );
    }

    /**
     * verify our external signer signed this request.
     * the "paymasterAndData" is expected to be the paymaster and a signature over the entire request params
     * paymasterAndData[:20] 	:   address(this)
     * paymasterAndData[20:116] : abi.encode(sponsorAddress, validUntil, validAfter)
     * paymasterAndData[116:] 	: signature
     */
    function _validatePaymasterUserOp(
        UserOperation calldata userOp,
        bytes32 /*userOpHash*/,
        uint256 requiredPreFund
    ) internal override returns (bytes memory context, uint256 validationData) {
        (requiredPreFund);

        (
            address sponsorAddress,
            uint48 validUntil,
            uint48 validAfter,
            bytes calldata signature
        ) = parsePaymasterAndData(userOp.paymasterAndData);
        // ECDSA library supports both 64 and 65-byte long signatures.
        // we only "require" it here so that the revert reason on invalid signature will be of "EtherspotPaymaster", and not "ECDSA"
        require(
            signature.length == 64 || signature.length == 65,
            "EtherspotPaymaster:: invalid signature length in paymasterAndData"
        );
        bytes32 hash = ECDSA.toEthSignedMessageHash(
            getHash(userOp, sponsorAddress, validUntil, validAfter)
        );
        address sig = userOp.getSender();

        // check signature is signed by the single verifying signer
        // don't revert on signature failure: return SIG_VALIDATION_FAILED
        if (verifyingSignerAddress != ECDSA.recover(hash, signature)) {
            return ("", _packValidationData(true, validUntil, validAfter));
        }

        // check sponsor has enough funds deposited to pay for gas
        require(
            getSponsorBalance(sponsorAddress) >= requiredPreFund,
            "EtherspotPaymaster:: Sponsor paymaster funds too low"
        );

        uint256 costOfPost = userOp.maxFeePerGas * COST_OF_POST;
        uint256 totalPreFund = requiredPreFund + costOfPost;

        // debit requiredPreFund amount
        _debitSponsor(sponsorAddress, totalPreFund);

        // no need for other on-chain validation: entire UserOp should have been checked
        // by the external service prior to signing it.
        return (
            abi.encode(sponsorAddress, sig, totalPreFund, costOfPost),
            _packValidationData(false, validUntil, validAfter)
        );
    }

    function parsePaymasterAndData(
        bytes calldata paymasterAndData
    )
        public
        pure
        returns (
            address sponsorAddress,
            uint48 validUntil,
            uint48 validAfter,
            bytes calldata signature
        )
    {
        (sponsorAddress, validUntil, validAfter) = abi.decode(
            paymasterAndData[SPONSOR_ADDRESS_OFFSET:SIGNATURE_OFFSET],
            (address, uint48, uint48)
        );
        signature = paymasterAndData[SIGNATURE_OFFSET:];
    }

    function _postOp(
        PostOpMode,
        bytes calldata context,
        uint256 actualGasCost
    ) internal override {
        (
            address sponsor,
            address sender,
            uint256 totalPrefund,
            uint256 costOfPost
        ) = abi.decode(context, (address, address, uint256, uint256));
        _creditSponsor(sponsor, totalPrefund - (actualGasCost + costOfPost));
        emit SponsorSuccessful(sponsor, sender);
    }
}
