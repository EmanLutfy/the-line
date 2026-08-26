'use client'

import { useCallback, useEffect, useState } from 'react'
import { parseEventLogs } from 'viem'
import {
  useAccount,
  useReadContract,
  useReadContracts,
  useWaitForTransactionReceipt,
  useWriteContract,
} from 'wagmi'
import { erc20Abi, lineMintAbi, theLineAbi } from './abi'
import { activeChain, lineAddress, mintAddress, nftAddress } from './chain'

export type Step =
  | 'idle'
  | 'approving'
  | 'confirmingApproval'
  | 'burning'
  | 'confirming'
  | 'success'
  | 'error'

/**
 * Every number on this page is read from a contract. Nothing about supply,
 * price or the token id a collector receives is decided in the browser — the
 * frontend's only job is to ask, and to show the answer.
 */
export function useMint() {
  const { address, chainId, isConnected } = useAccount()
  const wrongNetwork = isConnected && chainId !== activeChain.id

  const [step, setStep] = useState<Step>('idle')
  const [error, setError] = useState('')
  const [tokenId, setTokenId] = useState<bigint | null>(null)

  const configured = Boolean(nftAddress && mintAddress && lineAddress)

  /* --------------------------------------------------------------- reads */

  const { data: totalMinted, refetch: refetchMinted, error: supplyError } = useReadContract({
    address: nftAddress,
    abi: theLineAbi,
    functionName: 'totalMinted',
    chainId: activeChain.id,
    query: { enabled: Boolean(nftAddress), refetchInterval: 15_000 },
  })

  const { data: sale, error: saleError } = useReadContracts({
    contracts: [
      { address: mintAddress, abi: lineMintAbi, functionName: 'price', chainId: activeChain.id },
      { address: mintAddress, abi: lineMintAbi, functionName: 'saleOpen', chainId: activeChain.id },
      { address: mintAddress, abi: lineMintAbi, functionName: 'paused', chainId: activeChain.id },
    ],
    query: { enabled: Boolean(mintAddress), refetchInterval: 20_000 },
  })

  const price = sale?.[0]?.result as bigint | undefined
  const saleOpen = sale?.[1]?.result as boolean | undefined
  const paused = sale?.[2]?.result as boolean | undefined

  const { data: wallet, refetch: refetchWallet, error: walletError } = useReadContracts({
    contracts: [
      {
        address: lineAddress,
        abi: erc20Abi,
        functionName: 'balanceOf',
        args: address ? [address] : undefined,
        chainId: activeChain.id,
      },
      {
        address: lineAddress,
        abi: erc20Abi,
        functionName: 'allowance',
        args: address && mintAddress ? [address, mintAddress] : undefined,
        chainId: activeChain.id,
      },
      { address: lineAddress, abi: erc20Abi, functionName: 'decimals', chainId: activeChain.id },
    ],
    query: { enabled: Boolean(address && lineAddress && mintAddress) },
  })

  const balance = wallet?.[0]?.result as bigint | undefined
  const allowance = wallet?.[1]?.result as bigint | undefined
  const decimals = (wallet?.[2]?.result as number | undefined) ?? 18

  // A failed read shows up in the UI as a quiet em dash, which looks like
  // "loading" and hides the reason. React Query keeps the error rather than
  // throwing it, so it has to be asked for explicitly.
  useEffect(() => {
    const failures = { supplyError, saleError, walletError }
    for (const [name, error] of Object.entries(failures)) {
      if (error) console.error(`[mint] ${name}:`, error)
    }
  }, [supplyError, saleError, walletError])

  const hasEnough = balance !== undefined && price !== undefined && balance >= price
  const needsApproval = allowance !== undefined && price !== undefined && allowance < price

  /* --------------------------------------------------------------- writes */

  const { writeContractAsync } = useWriteContract()
  const [approvalHash, setApprovalHash] = useState<`0x${string}` | undefined>()
  const [mintHash, setMintHash] = useState<`0x${string}` | undefined>()

  const approvalReceipt = useWaitForTransactionReceipt({ hash: approvalHash })
  const mintReceipt = useWaitForTransactionReceipt({ hash: mintHash })

  // Once the approval confirms, go straight into the mint. Two wallet prompts
  // is already one more than anyone wants; making the second one manual would
  // be three clicks for one action.
  useEffect(() => {
    if (step === 'confirmingApproval' && approvalReceipt.isSuccess) {
      void sendMint()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, approvalReceipt.isSuccess])

  // The token id comes out of the Minted event in the receipt. It is never
  // guessed from totalMinted, which would be wrong for anyone whose mint
  // landed in the same block as somebody else's.
  useEffect(() => {
    if (step !== 'confirming' || !mintReceipt.isSuccess || !mintReceipt.data) return
    try {
      const logs = parseEventLogs({
        abi: lineMintAbi,
        eventName: 'Minted',
        logs: mintReceipt.data.logs,
      })
      const mine = logs.find(log => log.args.to?.toLowerCase() === address?.toLowerCase())
      if (!mine) throw new Error('mint confirmed but no Minted event was found for this wallet')
      setTokenId(mine.args.tokenId as bigint)
      setStep('success')
      void refetchMinted()
      void refetchWallet()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not read the minted token id.')
      setStep('error')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, mintReceipt.isSuccess])

  useEffect(() => {
    if (step === 'confirmingApproval' && approvalReceipt.isError) {
      setError('The approval transaction failed.')
      setStep('error')
    }
    if (step === 'confirming' && mintReceipt.isError) {
      setError('The mint transaction failed. Nothing was burned.')
      setStep('error')
    }
  }, [step, approvalReceipt.isError, mintReceipt.isError])

  const sendMint = useCallback(async () => {
    if (!mintAddress) return
    try {
      setStep('burning')
      const hash = await writeContractAsync({
        address: mintAddress,
        abi: lineMintAbi,
        functionName: 'mint',
        chainId: activeChain.id,
      })
      setMintHash(hash)
      setStep('confirming')
    } catch (cause) {
      setError(readableError(cause))
      setStep('error')
    }
  }, [writeContractAsync])

  const start = useCallback(async () => {
    if (!lineAddress || !mintAddress || price === undefined) return
    setError('')
    setTokenId(null)

    if (needsApproval) {
      try {
        setStep('approving')
        // Approve exactly the price, not an unlimited allowance. A collector
        // should not have to leave a standing permission behind to own a
        // picture.
        const hash = await writeContractAsync({
          address: lineAddress,
          abi: erc20Abi,
          functionName: 'approve',
          args: [mintAddress, price],
          chainId: activeChain.id,
        })
        setApprovalHash(hash)
        setStep('confirmingApproval')
      } catch (cause) {
        setError(readableError(cause))
        setStep('error')
      }
      return
    }

    await sendMint()
  }, [needsApproval, price, sendMint, writeContractAsync])

  const reset = useCallback(() => {
    setStep('idle')
    setError('')
    setTokenId(null)
    setApprovalHash(undefined)
    setMintHash(undefined)
  }, [])

  return {
    address,
    isConnected,
    wrongNetwork,
    configured,
    step,
    error,
    tokenId,
    mintHash,
    balance,
    decimals,
    price,
    saleOpen,
    paused,
    hasEnough,
    needsApproval,
    totalMinted: totalMinted as bigint | undefined,
    start,
    reset,
  }
}

/** Wallet errors are long and mostly noise; a collector needs the first line. */
function readableError(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause)
  if (/user rejected|denied transaction/i.test(message)) return 'Transaction cancelled.'
  if (/insufficient funds/i.test(message)) return 'Not enough ETH for gas.'
  if (/SaleClosed/.test(message)) return 'The mint is not open.'
  if (/WalletLimitReached/.test(message)) return 'This wallet has reached its limit.'
  if (/SupplyExhausted/.test(message)) return 'All 3,333 have been collected.'
  if (/BurnFailed/.test(message)) return 'The burn could not be verified. Nothing was taken.'
  return message.split('\n')[0].slice(0, 160)
}
