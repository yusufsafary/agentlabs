/* AgentLabs: public site configuration.
   Agents and this page read contract data from here only. Addresses are
   the deployed, Sourcify-verified contracts on BNB Chain (chain id 56). */
window.AGENTLABS_CONFIG = {
  CONTRACT: "0x639329f5dc4317c44D9Fed961a1217ba845012F7", // LabSpecimens NFT (SPEC)
  TOKEN: "0xDbdB07307F5C9553e86470b820b82ea74C0DAD90", // $LAB token (LabToken)
  CLAIM: "0xA0873b7891898eed61847470d15B165484E42F92", // LabClaim ($LAB holder claim)
  CLAIM_FEE_WEI: "245748690999118", // flat claim fee in BNB wei, forwarded to project wallet per claim
  AGENT_ID_REGISTRY: "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F", // SPACE ID Agent ID registry
  PROJECT_WALLET: "0x7f2ea716f5CDe280599F1928c30Ca308aD496a05",
  CHAIN_ID: 56,
  MAX_PER_EXPERIMENT: 10,
  RPCS: [
    "https://bsc-rpc.publicnode.com",
    "https://bsc-dataseed.bnbchain.org",
    "https://bsc-dataseed.binance.org",
    "https://bsc-dataseed1.binance.org"
  ]
};
