## Part 1 The Paymaster Contract
##### Steps:
1. Pushed the original [EtherspotPaymaster contract](https://github.com/etherspot/etherspot-prime-contracts/blob/master/src/paymaster/EtherspotPaymaster.sol), so that changes will show in the commits.
2. Removed whitelisting logic.
3.
	1. Add single verifying signer - set once and in the constructor and can be set by contract owner only.
	2. added sponsorAddress to paymasterAndData - this way 
		- UserOp will contain both the paymaster address and the sponsor address.
		- There will be a single verifying address, pretty much like this sample contract [VerifyingPaymaster.sol](https://github.com/eth-infinitism/account-abstraction/blob/abff2aca61a8f0934e533d0d352978055fddbd96/contracts/samples/VerifyingPaymaster.sol)
		- Sponsor address will be part of getHash - hash we're going to sign off-chain, and validate on-chain. And context.

