## Part3 Running the Examples

##### Steps:
1. Used Remix plugin to quickly reflect my local [EtherspotPaymaster contract](https://github.com/etherspot/etherspot-prime-contracts/blob/master/src/paymaster/EtherspotPaymaster.sol), deploy it with Entrypoint as arg.
2. The paymaster address is used for the task2 paymaster RPC service config env file: PAYMASTER_ADDRESS.
3. Satisfy the whitelisting logic, deposit and staking.
4. Adjust the rest of the configuration. Run the service. Then the erc4337 examples.
