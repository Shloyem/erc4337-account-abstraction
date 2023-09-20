## Part 2 The Paymaster RPC Service
In order to create an Paymaster RPC service, I used a [JavaScript/TypeScript implementation of JSON-RPC API for verifying paymasters](https://github.com/hangleang/verifying-paymaster-rpc).  
It serves as an off-chain service to recieve and approve UserOperations from any source.  
Forked [here](https://github.com/Shloyem/verifying-paymaster-rpc) as well.  

To command to run the service, as seen in the package file is:
    ```
    yarn run serve
    ```