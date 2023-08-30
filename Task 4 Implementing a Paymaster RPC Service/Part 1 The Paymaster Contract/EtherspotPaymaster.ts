/* eslint-disable @typescript-eslint/camelcase */
import { Wallet } from 'ethers';
import { ethers } from 'hardhat';
import { expect } from 'chai';
import { EntryPoint } from '../../account-abstraction/typechain';
import {
  EtherspotWallet,
  EtherspotPaymaster,
  EtherspotPaymaster__factory,
} from '../../typings';
import {
  createAccountOwner,
  createAddress,
  deployEntryPoint,
  rethrow,
  simulationResultCatch,
} from '../../account-abstraction/test/testutils';
import { createEtherspotWallet, errorParse } from '../TestUtils';
import { fillAndSign } from '../../account-abstraction/test/UserOp';
import {
  arrayify,
  defaultAbiCoder,
  hexConcat,
  parseEther,
} from 'ethers/lib/utils';
import { UserOperation } from '../../account-abstraction/test/UserOperation';

describe('EntryPoint with EtherspotPaymaster', function () {
  let entryPoint: EntryPoint;
  let accountOwner: Wallet;
  let wlaccOwner: Wallet;
  const ethersSigner = ethers.provider.getSigner();
  let account: EtherspotWallet;
  let wlaccount: EtherspotWallet;
  let offchainSigner: Wallet;
  let offchainSignerDifferent: Wallet;
  let sponsorAccount: Wallet;
  let funder: any;
  let acc1: any;
  let acc2: any;
  let paymaster: EtherspotPaymaster;
  let intpaymaster: any;

  const SUCCESS_OP = 0;
  const FAIL_OP = 2;
  const HASH =
    '0xead571b8d3ed9e40e7cb1d44db5a7ecc1e4297e2fc6a69235bf61f1c6a43c605';
  const GAS_COST = ethers.utils.parseEther('0.000000000000158574');
  const MOCK_VALID_UNTIL = '0x00000000deadbeef';
  const MOCK_VALID_AFTER = '0x0000000000001234';
  const MOCK_SIG = '0x1234';

  beforeEach(async () => {
    [funder] = await ethers.getSigners();

    this.timeout(20000);
    entryPoint = await deployEntryPoint();

    offchainSigner = createAccountOwner();
    sponsorAccount = createAccountOwner();
    accountOwner = createAccountOwner();
    wlaccOwner = createAccountOwner();


    paymaster = await new EtherspotPaymaster__factory(ethersSigner).deploy(
      entryPoint.address,
      offchainSigner.address
    );

    await paymaster.addStake(1, { value: parseEther('3') });
    await entryPoint.depositTo(paymaster.address, { value: parseEther('2') });
    ({ proxy: account } = await createEtherspotWallet(
      ethersSigner,
      accountOwner.address,
      entryPoint.address
    ));
    ({ proxy: wlaccount } = await createEtherspotWallet(
      ethersSigner,
      wlaccOwner.address,
      entryPoint.address
    ));


    await funder.sendTransaction({
      to: offchainSigner.address,
      value: ethers.utils.parseEther('20.0'),
    });
    await funder.sendTransaction({
      to: sponsorAccount.address,
      value: ethers.utils.parseEther('20.0'),
    });
  });

  describe('#parsePaymasterAndData', () => {
    it('should parse data properly', async () => {
      const paymasterAndData = hexConcat([
        paymaster.address,
        defaultAbiCoder.encode(
          ['address', 'uint48', 'uint48'],
          [offchainSigner.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
        ),
        MOCK_SIG,
      ]);
      const res = await paymaster.parsePaymasterAndData(paymasterAndData);

      expect(res.sponsorAddress).to.be.equal(offchainSigner.address);
      expect(res.validUntil).to.be.equal(
        ethers.BigNumber.from(MOCK_VALID_UNTIL)
      );
      expect(res.validAfter).to.be.equal(
        ethers.BigNumber.from(MOCK_VALID_AFTER)
      );
      expect(res.signature).equal(MOCK_SIG);
    });
  });


  describe('#validatePaymasterUserOp', () => {
    it('should reject on no signature', async () => {
      const userOp = await fillAndSign(
        {
          sender: account.address,
          paymasterAndData: hexConcat([
            paymaster.address,
            defaultAbiCoder.encode(
              ['address', 'uint48', 'uint48'],
              [offchainSigner.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
            ),
            '0x1234',
          ]),
          verificationGasLimit: 120000,
        },
        accountOwner,
        entryPoint
      );
      const revert = await entryPoint.callStatic
        .simulateValidation(userOp)
        .catch((e) => {
          return e.errorArgs.reason;
        });
      expect(revert).to.contain(
        'EtherspotPaymaster:: invalid signature length in paymasterAndData'
      );
    });

    it('should reject on invalid signature', async () => {
      const userOp = await fillAndSign(
        {
          sender: account.address,
          paymasterAndData: hexConcat([
            paymaster.address,
            defaultAbiCoder.encode(
              ['address', 'uint48', 'uint48'],
              [offchainSigner.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
            ),
            '0x' + '00'.repeat(65),
          ]),
          verificationGasLimit: 120000,
        },
        accountOwner,
        entryPoint
      );
      const revert = await entryPoint.callStatic
        .simulateValidation(userOp)
        .catch((e) => {
          return e.errorArgs.reason;
        });
      expect(revert).to.contain('ECDSA: invalid signature');
    });

    describe('with wrong signature', () => {
      let wrongSigUserOp: UserOperation;
      const beneficiaryAddress = createAddress();
      before(async () => {
        const sig = await offchainSigner.signMessage(arrayify('0xdead'));
        wrongSigUserOp = await fillAndSign(
          {
            sender: account.address,
            paymasterAndData: hexConcat([
              paymaster.address,
              defaultAbiCoder.encode(
                ['address', 'uint48', 'uint48'],
                [offchainSigner.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
              ),
              sig,
            ]),
          },
          accountOwner,
          entryPoint
        );
      });

      it('should return signature error (no revert) on wrong signer signature', async () => {
        const ret = await entryPoint.callStatic
          .simulateValidation(wrongSigUserOp)
          .catch(simulationResultCatch);
        expect(ret.returnInfo.sigFailed).to.be.true;
      });

      it('handleOp revert on signature failure in handleOps', async () => {
        await expect(
          entryPoint.estimateGas.handleOps([wrongSigUserOp], beneficiaryAddress)
        )
          .to.revertedWithCustomError(entryPoint, 'FailedOp')
          .withArgs(0, 'AA34 signature error');
      });
    });

    it('succeed with a valid signature', async () => {
      // Deposit funds for gas.
      await paymaster
        .connect(sponsorAccount)
        .depositFunds({ value: ethers.utils.parseEther('2.0') });

      // Made by user/wallet --> and sent to offchain signer
      // This is like the account (user) sends the off-chain service, not signed yet
      const userOp1 = await fillAndSign(
        {
          sender: account.address,
          paymasterAndData: hexConcat([
            paymaster.address,
            defaultAbiCoder.encode(
              ['address', 'uint48', 'uint48'],
              [sponsorAccount.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
            ),
            '0x' + '00'.repeat(65),
          ]),
          verificationGasLimit: 120000,
        },
        accountOwner,
        entryPoint
      );

      // Called By offChainService.
      // this method is called by the off-chain service, to sign the request.
      const hash = await paymaster.getHash(
        userOp1,
        sponsorAccount.address,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER
      );

      // Offchain signer signs the hash from getHash
      const sig = await offchainSigner.signMessage(arrayify(hash));

      // UserOp with OffchainSigner signature
      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymaster.address,
            defaultAbiCoder.encode(
              ['address', 'uint48', 'uint48'],
              [sponsorAccount.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
            ),
            sig, // added from before
          ]),
        },
        accountOwner,
        entryPoint
      );

      // Run simulation
      const res = await entryPoint.callStatic
        .simulateValidation(userOp)
        .catch(simulationResultCatch);

      expect(res.returnInfo.sigFailed).to.be.false;
      expect(res.returnInfo.validAfter).to.be.equal(
        ethers.BigNumber.from(MOCK_VALID_AFTER)
      );
      expect(res.returnInfo.validUntil).to.be.equal(
        ethers.BigNumber.from(MOCK_VALID_UNTIL)
      );
    });

    it('fail on signed by not the single verifying signer', async () => {
      await paymaster
        .connect(sponsorAccount)
        .depositFunds({ value: ethers.utils.parseEther('2.0') });

      const userOp1 = await fillAndSign(
        {
          sender: account.address,
          paymasterAndData: hexConcat([
            paymaster.address,
            defaultAbiCoder.encode(
              ['address', 'uint48', 'uint48'],
              [sponsorAccount.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
            ),
            '0x' + '00'.repeat(65),
          ]),
          verificationGasLimit: 120000,
        },
        accountOwner,
        entryPoint
      );

      const hash = await paymaster.getHash(
        userOp1,
        sponsorAccount.address,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER
      );

      // signed by offchainSignerDifferent and not offchainSigner !
      const sig = await offchainSignerDifferent.signMessage(arrayify(hash));

      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymaster.address,
            defaultAbiCoder.encode(
              ['address', 'uint48', 'uint48'],
              [sponsorAccount.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
            ),
            sig,
          ]),
        },
        accountOwner,
        entryPoint
      );

      const res = await entryPoint.callStatic
        .simulateValidation(userOp)
        .catch(simulationResultCatch);

      expect(res.returnInfo.sigFailed).to.be.true;
    });

    it('error thrown if sponsor balance too low', async () => {
      // No deposit by sponsor account
      // await paymaster
      //   .connect(sponsorAccount)
      //   .depositFunds({ value: ethers.utils.parseEther('2.0') });

      const userOp1 = await fillAndSign(
        {
          sender: account.address,
          paymasterAndData: hexConcat([
            paymaster.address,
            defaultAbiCoder.encode(
              ['address', 'uint48', 'uint48'],
              [sponsorAccount.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
            ),
            '0x' + '00'.repeat(65),
          ]),
          verificationGasLimit: 120000,
        },
        accountOwner,
        entryPoint
      );

      const hash = await paymaster.getHash(
        userOp1,
        sponsorAccount.address,
        MOCK_VALID_UNTIL,
        MOCK_VALID_AFTER
      );

      const sig = await offchainSigner.signMessage(arrayify(hash));

      const userOp = await fillAndSign(
        {
          ...userOp1,
          paymasterAndData: hexConcat([
            paymaster.address,
            defaultAbiCoder.encode(
              ['address', 'uint48', 'uint48'],
              [sponsorAccount.address, MOCK_VALID_UNTIL, MOCK_VALID_AFTER]
            ),
            sig,
          ]),
        },
        accountOwner,
        entryPoint
      );

      const revert = await entryPoint.callStatic
        .simulateValidation(userOp)
        .catch((e) => {
          return e.message;
        });
      expect(revert).to.contain(
        'EtherspotPaymaster:: Sponsor paymaster funds too low'
      );
    });
  });
