There is an interesting 4 parts blog by Alchemy, where they walk through the process of trying to design a simple version of account abstraction, and end up with something that gets close to ERC-4337.
[Alchemy Blog: Account Abstraction](https://www.alchemy.com/blog/account-abstraction)

Part1
=====
- Asset-holder must be a smart contract - If it were an EOA, then the assets could always be transferred by transactions signed by the EOA’s private key, which bypasses the security we want.
- Each user needs their own smart contract -  There can’t be one big contract holding the assets of multiple people because the rest of the ecosystem assumes that one address represents one entity and won’t be able to distinguish the individual users.
- In user operation - parameters which we would normally pass to eth_sendTransaction + signature:
For our NFT-protecting wallet, for most user ops we’d pass a signature of the rest of the op signed by our main key.
But if the user op is transferring our super-valuable Carbonated Courage NFT, then the wallet will need us to pass signatures of the rest of the op signed by each of our two keys instead.
Nonce: to prevent replay attacks.
- Almost all wallets to use the signature field to receive some kind of signature over all the other fields to prevent unauthorized parties from forging or tampering with the op.
- I would expect almost any wallet to reject an op with a nonce it has already seen.
- We split into validate and execute because we wanted the wallet to:
	* Not pay if not valid (a stranger can abuse this and make the wallet pay gas)
	* Do pay if valid but operation failed - his fault.
- Why doesn’t a dishonest wallet just do all its execution in validateOp, so that if the execution fails it won’t be charged for gas? 
validateOp will have significant restrictions that make it unsuitable for “real” operations.
- The executor doesn’t need to simulate the entire execution (validateOp + executeOp), but only validateOp, to know if it’s going to get paid or not.
- The executor will reject the user op without ever putting it on chain unless validateOp satisfies the following restrictions:
1. It never uses opcodes from a certain banlist, which includes codes like TIMESTAMP, BLOCKHASH, etc.
2. The only storage it accesses is the wallet’s associated storage, defined as any of the following:
	^ The wallet’s own storage.
	^ Another contract’s storage at a slot corresponding to the wallet in a mapping(address => value).
	^ Another contract’s storage at a storage slot equal to the wallet address (this is an unusual storage scheme that doesn’t occur naturally in Solidity).
The goal of these rules is to minimize cases where validateOp succeeds in simulation but fails in real execution.

- Entry point can ask validateOp method for funds, and if validateOp doesn’t pay the requested amount - reject the op.
- When writing a smart contract, it’s iffy to send ETH to an arbitrary contract so we won’t directly send the extra gas money back to the wallet.
Instead, we’ll hold on to it and allow the wallet to get it out by making a call to withdraw it later. This is the pull-payment pattern.
- Wallet’s gas payment can from two different places: 1) its ETH held by the entry point or 2) ETH that the wallet holds itself.
- The entry point will try to pay for gas using the deposited ETH first, and then if there isn’t enough deposited it will ask for the remaining portion when calling the wallet’s validateOp.

- To compensate executors, we’ll allow wallet owners to submit a tip with their user ops that will go to the executor.
maxPriorityFeePerGas represents a fee that the sender is willing to pay to have their operation prioritized.
The executor, when sending its transaction to call the entry point’s handleOp, can choose a lower maxPriorityFeePerGas and pocket the difference
- Entry point is a singleton across the whole ecosystem

- **There is a "No Separate EOA" Recap !**
Bundling:
- handleOps does:
		* For each op, call validateOp on the op’s sender wallet. Any ops that fail validation we discarded.
		* For each op, call executeOp on the op’s sender wallet, tracking how much gas we use, then transfer ETH to the executor to pay for that gas.
		ALL VALIDATIONS ==> ALL EXECUTIONS.
- The one thing of note here is that we first perform all the validations and only then perform all the executions, rather than validating and executing each op before moving on to the next one.
- As long as the bundle doesn’t include multiple ops for the same wallet(storage restrictions) -> if the validations of two ops don’t touch the same storage, 
they can’t interfere with each other -> executors will make sure that a bundle contains at most one op from any given wallet.
-MEV: The executor has the opportunity to get some Maximal Extractable Value (MEV) by arranging user ops within a bundle (and possibly inserting their own) in a way that’s profitable.

- Just as nodes store ordinary transactions in a mempool and broadcast them to other nodes, bundlers can store validated user ops in a mempool and broadcast them to other bundlers. 
- Bundlers can validate user ops before sharing them with other bundlers, saving each other the work of validating every operation.

- A bundler can benefit by also being a block builder, because if they can choose the block that their bundle is included in, they can:
	* reduce or even eliminate the possibility of operations failing during execution after succeeding in simulation. 
	* Further, block builders and bundlers can benefit in similar ways by knowing how to extract MEV.
	* Over time, we might expect that bundlers and block builders merge into the same role.

- We fully replicated the functionality of an EOA and improved by allowing users to choose their own custom validation logic.

Part2
=======
- Paymaster - a contract which looks at a user op and decides if it’s willing to pay for that op or not.

- Executor calls both a paymaster contract and a user's smart contract wallet to determine if the user's transaction can be sponsored.
- entry point’s handleOps (w/ using paymasters):
	For each op:
	* Call validateOp on the wallet specified by the op’s sender
	* If the op has a paymaster address, then call validatePaymasterOp on that paymaster
	* Any ops which fail either validation are discarded
	* For each op, call executeOp on the op’s sender wallet, tracking how much gas we use, 
		then transfer ETH to the executor to pay for that gas. If the op has a paymaster field,
		then this ETH comes from the paymaster. Otherwise, it comes from the wallet as before.

- Paymaster staking: Reputation system: 
	* We’ll have the bundler keep track of how often each paymaster has failed validation recently, 
	and penalize paymasters that fail a lot by throttling or banning ops that use that paymaster.
	* This reputation system won’t work if a malicious paymaster can just create many instances of itself (a Sybil attack), 
	so we require paymasters to stake ETH. This way it doesn’t benefit from having multiple accounts.
	
	There is an exception to the staking rules: If the paymaster only ever accesses the wallet’s associated storage and not the paymaster’s own, then it does not need to put up a stake
- Each bundler tracks reputation locally.
- Unlike many staking schemes, the stakes here are never slashed. They exist simply as a way to require a potential attacker to lock up a very large amount of capital to attack at scale.
- Improvement: Paymaster postOp
	* paymaster might also need to do something differently based on the result of the operation. 
	  We’ll add a new method, postOp, to the paymaster which the entry point will call after the operation is done and pass it how much gas was used
	* We also want the paymaster to be able to “pass information to itself” and use data that it has computed **during validation** in the post-op step, 
		so we’ll allow the validation to return arbitrary “context” data which will later be passed to postOp.
	* To give postOp a bit more context, we’ll give it one more parameter: a flag to indicate whether we are in its “second run” after it already reverted once

There's a recap at the end!!!

Part3
=======
1. Should be able to create a brand new wallet on-chain:
either 
- paying for their own gas with ETH (even though they don’t have a wallet yet) 
- or by finding a paymaster who will pay for their gas (which we covered in part 2), 
and they should be able to do this without ever creating an EOA.

2. We would like our wallet to be able to tell our address and receive assets before we’ve actually deployed our wallet contract.

Part4
======
- An aggregation scheme is defined by how it combines multiple signatures into one 
and by how it validates the combined signature, so an aggregator exposes these two functions as methods:

contract Aggregator {
  function aggregateSignatures(UserOperation[] ops)
    returns (bytes aggregatedSignature);

  function validateSignatures(UserOperation[] ops, bytes signature);
}

- If a wallet wants to participate in aggregation, it exposes a method to choose its aggregator:

contract Wallet {
  // ...

  function getAggregator() returns (address);
}


- There's a wrap up section. 