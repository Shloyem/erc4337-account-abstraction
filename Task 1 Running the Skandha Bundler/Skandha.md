Optimal steps to run the Skandha Bundler on Fuse Spark network IMHO:

1. Go to[Skandha bundler by Etherspot Github repo](https://github.com/etherspot/skandha), clone it and follow the steps.

2. Edit the config to:
```
"networks": {
	"fuseSparknet": {
	      "entryPoints": [
	        "0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789"
	      ],
	      "relayer": "RELAYER_PRIVATE_KEY",
	      "beneficiary": "BENEFICIARY_ADDRESS",
	      "rpcEndpoint": "https://bundler.rpc.fusespark.io/",
	      "minInclusionDenominator": 10,
	      "throttlingSlack": 10,
	      "banSlack": 10
	    }
}
```
I set the configutation as seen [here](https://docs.stackup.sh/docs/erc-4337-bundler-configuration#optional):
Where beneficiary defaults to the public address of the private key (relayer).

3. run `./skandha --unsafeMode --redirectRpc`

4. Send relayer address native Fuse tokens on spark network [here](https://chaindrop.org/?chainid=123&token=0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee)

5. Network will be available at `http://localhost:14337/{chainId}/` so in our case `http://localhost:14337/123/`
