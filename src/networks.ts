export interface AxelarNetworkDefaults {
  gatewayAddress: string;
  gasServiceAddress: string;
  itsAddress: string;
  itsFactoryAddress: string;
  whbarAddress: string;
  chainName: string;
  chainId: number;
  rpcUrl: string;
  apiBaseUrl: string;
  gmpApiBaseUrl: string;
  nestServerUrl: string;
}

export interface AxelarConfig {
  network?: "mainnet" | "testnet";
  gatewayAddress?: string;
  gasServiceAddress?: string;
  itsAddress?: string;
  chainName?: string;
  apiBaseUrl?: string;
  gmpApiBaseUrl?: string;
  nestServerUrl?: string;
}

export const AXELAR_MAINNET: AxelarNetworkDefaults = {
  gatewayAddress: "0xe432150cce91c13a887f7D836923d5597adD8E31",
  gasServiceAddress: "0x2d5d7d31F671F86C782533cc367F14109a082712",
  itsAddress: "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C",
  itsFactoryAddress: "0x83a93500d23Fbc3e82B410aD07A6a9F7A0670D66",
  whbarAddress: "0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed",
  chainName: "hedera",
  chainId: 295,
  rpcUrl: "https://mainnet.hashio.io/api",
  apiBaseUrl: "https://api.axelarscan.io",
  gmpApiBaseUrl: "https://api.gmp.axelarscan.io",
  nestServerUrl: "https://nest-server-mainnet.axelar.dev",
};

export const AXELAR_TESTNET: AxelarNetworkDefaults = {
  gatewayAddress: "0xe432150cce91c13a887f7D836923d5597adD8E31",
  gasServiceAddress: "0xbE406F0189A0B4cf3A05C286473D23791Dd44Cc6",
  itsAddress: "0xB5FB4BE02232B1bBA4dC8f81dc24C26980dE9e3C",
  itsFactoryAddress: "0x83a93500d23Fbc3e82B410aD07A6a9F7A0670D66",
  whbarAddress: "0xb1F616b8134F602c3Bb465fB5b5e6565cCAd37Ed",
  chainName: "hedera",
  chainId: 296,
  rpcUrl: "https://testnet.hashio.io/api",
  apiBaseUrl: "https://testnet.api.axelarscan.io",
  gmpApiBaseUrl: "https://testnet.api.gmp.axelarscan.io",
  nestServerUrl: "https://nest-server-testnet.axelar.dev",
};

export const NETWORK_DEFAULTS = {
  mainnet: AXELAR_MAINNET,
  testnet: AXELAR_TESTNET,
} as const;
