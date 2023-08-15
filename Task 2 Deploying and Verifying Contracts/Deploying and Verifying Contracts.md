In order to deploy the Zerodev’s kernel factory to Spark testnet and verify the contracts, I executed the following command in the [Kernel repository](https://github.com/zerodevapp/kernel):
```
forge create --legacy --rpc-url https://rpc.fusespark.io/ --private-key [PRIVATE_KEY] src/factory/KernelFactory.sol:KernelFactory --constructor-args 0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789 --verify --verifier blockscout --verifier-url https://explorer.fusespark.io/api?[API_KEY_FROM_FUSESPARK]
```

- Transaction hash of the deployment: 0x5a1cf59991b7a77e4742c40cb34ecf5f90ff4290c8b0d63f0feb76401cf8ca4c
- Contract address of the deployed contract: 0x0C4a49D1D3f151607B0Cd2203c1a686d22d9F38C
- A brief explanation of the steps you took to deploy and verify the contract:
	- First I deployed and verified an simple Foundry contract to Fusespark test network. It required the --legacy flag, unlike Goerli.
	- forge create command is Foundry's way to deploy a smart contract, so I used it and passed EntryPoint contract as constructor argument.
	- Foundry's way to verify is via --verify command. From experimenting verifying passed by providing --verifier-url url path with fusespark API, and passing blockscout as verifier.
	
	
### Other ways that were considered:

1. To run the deploy kernel script:
```
forge script script/DeployKernel.s.sol:DeployKernel --rpc-url https://rpc.fusespark.io/
```
2. Create a deployment script using typescript, and verify using @nomiclabs/hardhat-etherscan or @nomicfoundation/hardhat-verify plugins:

	1. In hardhat.config.ts add to HardhatUserConfig:
		- import "@nomiclabs/hardhat-etherscan";

		- In networks section:

			fusespark: {
			  accounts: getAccounts(),
			  url: "https://rpc.fusespark.io/",
			  gas: 3000000,
			  gasPrice: 10000000000,
			  chainId: 123
			}
		  },
		  etherscan: {
			apiKey: {
			  fusespark: process.env.FUSESPARK_API_KEY || "",
			},
			customChains: [
			  {
				network: "fusespark",
				chainId: 123,
				urls: {
				  apiURL: "https://explorer.fusespark.io/api",
				  browserURL: "https://explorer.fusespark.io"
				}
			  }
			]

		2.DeployKernel.ts:

		import "@nomiclabs/hardhat-etherscan";
		import hre, { ethers, network } from "hardhat";

		async function main() {
		  const ENTRY_POINT_ADDR = "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789";
		  const KernelFactory = await ethers.getContractFactory("KernelFactory");
		  const kernelFactory = await KernelFactory.deploy(ENTRY_POINT_ADDR);
		  await kernelFactory.deployed();
		  console.log("\nKernelFactory deployed at", kernelFactory.address, "✅");

		  try {
			console.log("\nKernelFactory contract Etherscan verification in progress...");
			await kernelFactory.deployTransaction.wait(6);
			await hre.run("verify:verify", {
			  address: kernelFactory.address,
			  constructorArguments: [ENTRY_POINT_ADDR],
			  contract: "src/factory/KernelFactory.sol:KernelFactory",
			});
			console.log("nKernelFactory Etherscan verification done. ✅");
		  } catch (error) {
			console.error(error);
		  }
		}

		main().catch((error) => {
		  console.error(error);
		  process.exitCode = 1;
		});

		3. Run 
		```
		npx hardhat run scripts/DeployKernel.ts --network fusespark
		```
3. Use flatten by forge flatten or hardhat flatten or Remix IDE, and verify in the (FuseSpark explorer)[https://explorer.fusespark.io/] contract address.
4. Programatically use deprecated truffle-plugin-verify plugin