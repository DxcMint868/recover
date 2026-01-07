import { NextRequest, NextResponse } from "next/server";
import { ethers } from "ethers";

// USDC Contract ABI (only the functions we need)
const USDC_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
];

// Network Configuration
const NETWORK_CONFIG = {
  // Base Mainnet
  base: {
    chainId: 8453,
    name: "Base",
    usdcAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", // Native USDC on Base
    rpcUrl: "https://1rpc.io/base",
  },
  // Base Sepolia Testnet
  "base-sepolia": {
    chainId: 84532,
    name: "Base Sepolia",
    usdcAddress: "0x754E7659257E67489e7ea9f4a126F9DFc69268ff", // USDC on Base Sepolia
    rpcUrl: "https://base-sepolia.gateway.tenderly.co",
  },
};

// Get network from environment or default to base
const NETWORK = (process.env.NETWORK || "base") as keyof typeof NETWORK_CONFIG;
const NETWORK_INFO = NETWORK_CONFIG[NETWORK];

// Hardcoded destination wallet address
const DESTINATION_WALLET =
  process.env.DESTINATION_WALLET ||
  "0xfd1de6af6abb6f4c553c59399942505ca779cfbb"; // REPLACE THIS!

// Minimum USDC balance threshold (100 USDC)
const MIN_USDC_BALANCE = ethers.parseUnits("100", 6); // USDC has 6 decimals

export async function POST(request: NextRequest) {
  try {
    // Authenticate the request
    const apiSecret = request.headers.get("x-api-secret");

    if (!apiSecret || apiSecret !== process.env.API_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Validate environment variables
    if (!process.env.WALLET_PRIVATE_KEY) {
      return NextResponse.json(
        { error: "WALLET_PRIVATE_KEY not configured" },
        { status: 500 }
      );
    }

    if (!process.env.RPC_URL) {
      return NextResponse.json(
        { error: "RPC_URL not configured" },
        { status: 500 }
      );
    }

    // Initialize provider and wallet
    const rpcUrl = process.env.RPC_URL || NETWORK_INFO.rpcUrl;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY, provider);

    // Verify we're on the correct network
    const network = await provider.getNetwork();
    if (Number(network.chainId) !== NETWORK_INFO.chainId) {
      console.warn(
        `Warning: Connected to chain ${network.chainId}, expected ${NETWORK_INFO.chainId} (${NETWORK_INFO.name})`
      );
    }

    // Initialize USDC contract
    const usdcContract = new ethers.Contract(
      NETWORK_INFO.usdcAddress,
      USDC_ABI,
      wallet
    );

    // Check USDC balance
    const balance = await usdcContract.balanceOf(wallet.address);
    const balanceFormatted = ethers.formatUnits(balance, 6);

    console.log(
      `[${new Date().toISOString()}] Network: ${NETWORK_INFO.name} (Chain ID: ${
        NETWORK_INFO.chainId
      })`
    );
    console.log(`[${new Date().toISOString()}] Wallet: ${wallet.address}`);
    console.log(
      `[${new Date().toISOString()}] USDC Balance: ${balanceFormatted}`
    );

    // Check if balance is greater than 100 USDC
    if (balance < MIN_USDC_BALANCE) {
      return NextResponse.json({
        success: false,
        message: "Balance below threshold",
        balance: balanceFormatted,
        threshold: "100",
        walletAddress: wallet.address,
      });
    }

    // Balance is above threshold, send all USDC
    console.log(
      `[${new Date().toISOString()}] Balance above threshold! Initiating transfer...`
    );

    // Send the transaction
    const tx = await usdcContract.transfer(DESTINATION_WALLET, balance);
    console.log(`[${new Date().toISOString()}] Transaction sent: ${tx.hash}`);

    // Wait for confirmation
    const receipt = await tx.wait();
    console.log(
      `[${new Date().toISOString()}] Transaction confirmed in block ${
        receipt.blockNumber
      }`
    );

    return NextResponse.json({
      success: true,
      message: "USDC transferred successfully",
      amount: balanceFormatted,
      transactionHash: tx.hash,
      blockNumber: receipt.blockNumber,
      from: wallet.address,
      to: DESTINATION_WALLET,
    });
  } catch (error: any) {
    console.error(`[${new Date().toISOString()}] Error:`, error);

    return NextResponse.json(
      {
        success: false,
        error: error.message || "Unknown error occurred",
        details: error.reason || error.code || "No additional details",
      },
      { status: 500 }
    );
  }
}

// Also support GET for health check
export async function GET(request: NextRequest) {
  const apiSecret = request.headers.get("x-api-secret");

  if (!apiSecret || apiSecret !== process.env.API_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rpcUrl = process.env.RPC_URL || NETWORK_INFO.rpcUrl;
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!, provider);
    const usdcContract = new ethers.Contract(
      NETWORK_INFO.usdcAddress,
      USDC_ABI,
      wallet
    );

    const balance = await usdcContract.balanceOf(wallet.address);
    const ethBalance = await provider.getBalance(wallet.address);
    const network = await provider.getNetwork();

    return NextResponse.json({
      status: "ok",
      network: NETWORK_INFO.name,
      chainId: Number(network.chainId),
      walletAddress: wallet.address,
      usdcBalance: ethers.formatUnits(balance, 6),
      ethBalance: ethers.formatEther(ethBalance),
      threshold: "100",
      destinationWallet: DESTINATION_WALLET,
      usdcContractAddress: NETWORK_INFO.usdcAddress,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        status: "error",
        error: error.message,
      },
      { status: 500 }
    );
  }
}
