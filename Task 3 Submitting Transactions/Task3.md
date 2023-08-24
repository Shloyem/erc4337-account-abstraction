## 1. Transaction: Deployment of a Kernel Wallet + A native Fuse transfer to another address: 
Transaction hash on Polygon Mumbai: 0x04f9b49261b0146dac186132145c614040f6251ecad0838f06eb0da0dbf04087  
Link to transaction on JiffyScan to see UserOp: [here](https://app.jiffyscan.xyz/bundle/0x04f9b49261b0146dac186132145c614040f6251ecad0838f06eb0da0dbf04087?network=mumbai&pageNo=0&pageSize=10).  
Successful screenshot: 
![Screenshot of transfer](transfer.JPG)

#### Brief explanation:
Following the [kernel wallet example tutorial](https://docs.stackup.sh/docs/erc-4337-examples-zerodev-kernel) related to this [Github repo](https://github.com/stackup-wallet/erc-4337-examples):
1.  Running:
    ```
    yarn run kernel address 
    ```
    on Polygon Mumbai with Stackup API node URL, returns a counterfactual address for the private key.  

2. Running:
    ```
    yarn run kernel transact
    ```
    and then CLI select transfer.
    
    First it errored on "AA40 over verificationGasLimit"
    I tried to increase verificationGasLimit field, but signature would not fit anymore.  
    So I used a workaround code snippet from Stackup's devs Discord to increase the verificationGasLimit:
    ```
      kernel
        // Buffer
        .useMiddleware(async (ctx) => {
          ctx.op.verificationGasLimit = ethers.BigNumber.from(
            ctx.op.verificationGasLimit
          ).mul(2);
        })
        // Resign
        .useMiddleware(
          Presets.Middleware.EOASignature(new ethers.Wallet(config.signingKey))
        )
        // Apply Kernel Sudo mode
        .useMiddleware(async (ctx) => {
          ctx.op.signature = ethers.utils.hexConcat([
            Constants.Kernel.Modes.Sudo,
            ctx.op.signature,
          ]);
        });
    ```
    And then the transaction worked.


