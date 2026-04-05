import { getDefaultConfig } from '@rainbow-me/rainbowkit'
import { baseSepolia } from 'wagmi/chains'
import { http } from 'wagmi'
import { getAddress } from 'viem'

export const wagmiConfig = getDefaultConfig({
  appName: 'Pulse Protocol',
  projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID!,
  chains: [baseSepolia],
  transports: {
    [baseSepolia.id]: http('https://sepolia.base.org'),
  },
  ssr: true,
})

export const VAULT_ADDRESS = getAddress('0x318b8160ec4efe094dfe2505fa139098156c2c17')
export const USDC_ADDRESS = getAddress('0x036cbd53842c5426634e7929541ec2318f3dcf7e')

export const VAULT_ABI = [
  {
    name: 'placeBet',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'marketId', type: 'bytes32' },
      { name: 'bucket', type: 'uint8' },
      { name: 'amount', type: 'uint256' }
    ],
    outputs: [{ name: 'betId', type: 'bytes32' }]
  },
  {
    name: 'claimWinnings',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'betId', type: 'bytes32' }],
    outputs: []
  },
  {
    name: 'claimRefund',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'betId', type: 'bytes32' }],
    outputs: []
  },
  {
    name: 'getCurrentOdds',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'marketId', type: 'bytes32' }],
    outputs: [
      { name: 'yesOdds', type: 'uint256' },
      { name: 'noOdds', type: 'uint256' }
    ]
  }
] as const

export const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ name: '', type: 'bool' }]
  },
  {
    name: 'allowance',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  },
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }]
  }
] as const
