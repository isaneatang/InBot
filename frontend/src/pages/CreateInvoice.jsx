import { useState } from "react";
import { useAccount } from "wagmi";
import { useNavigate } from "react-router-dom";
import { isAddress } from "viem";
import { useFactoryContract, INVOICE_ABI } from "../hooks/useInvoiceFactory";
import { useToast } from "../components/Toast";
import { formatMoney, parseUnits } from "../lib/format";
import { INVOICE_FACTORY_ADDRESS } from "../config/network";

export default function CreateInvoice() {
  const { address, isConnected } = useAccount();
  const navigate = useNavigate();
  const toast = useToast();
  const c = useFactoryContract();
  const [buyer, setBuyer] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [txState, setTxState] = useState("idle");
  const [txHash, setTxHash] = useState("");

  const buyerError = buyer && !isAddress(buyer) ? "Not a valid address" : buyer && buyer.toLowerCase() === address?.toLowerCase() ? "Buyer cannot be yourself" : "";
  const amountNum = Number(amount);
  const amountError = amount && (!isFinite(amountNum) || amountNum <= 0) ? "Enter an amount greater than zero" : "";
  const descLen = description.length;
  const valid = isAddress(buyer) && !buyerError && !amountError && amountNum > 0 && descLen > 0;

  const handleSubmit = async () => {
    if (!valid) return;
    const amountWei = parseUnits(amount);
    setTxState("pending");
    try {
      const hash = await c.writeContractAsync({
        address: INVOICE_FACTORY_ADDRESS,
        abi: INVOICE_ABI,
        functionName: "createInvoice",
        args: [buyer, amountWei, description],
      });
      setTxHash(hash);
      setTxState("confirmed");
      toast.push("Invoice created", "success");
      const newCount = Number(await c.nextInvoiceId());
      setTimeout(() => navigate(`/invoice/${newCount - 1}`), 1200);
    } catch (e) {
      setTxState("error");
      toast.push(e?.shortMessage || "Transaction failed", "error");
    }
  };

  if (!isConnected) {
    return (
      <div className="card max-w-md mx-auto p-8 text-center">
        <p className="mb-4">Connect your wallet to create an invoice.</p>
        <button className="btn btn-primary px-6 py-2" onClick={() => navigate("/")}>Connect Wallet</button>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto">
      <h1 className="text-xl font-semibold mb-6">Create Invoice</h1>
      <div className="card p-6 space-y-4">
        <div>
          <label className="label mb-1 block">Buyer wallet address</label>
          <input
            className={`input font-mono ${buyerError ? "input-error" : ""}`}
            placeholder="0x..."
            value={buyer}
            onChange={(e) => setBuyer(e.target.value)}
          />
          {buyerError && <p className="text-xs text-danger mt-1">{buyerError}</p>}
        </div>

        <div>
          <label className="label mb-1 block">Amount (USDT)</label>
          <input
            className={`input tabular ${amountError ? "input-error" : ""}`}
            type="text" inputMode="decimal"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
          {amountError && <p className="text-xs text-danger mt-1">{amountError}</p>}
        </div>

        <div>
          <label className="label mb-1 block">Description</label>
          <textarea
            className="input resize-none"
            rows={3}
            maxLength={280}
            placeholder="What is this invoice for?"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-xs text-text-secondary mt-1 text-right tabular">{descLen}/280</p>
        </div>

        <div className="border border-border rounded-md p-3 text-sm">
          <div className="label mb-1">Summary</div>
          <div className="flex justify-between"><span className="text-text-secondary">To</span><span className="font-mono">{buyer || "-"}</span></div>
          <div className="flex justify-between mt-1"><span className="text-text-secondary">Amount</span><span className="tabular">{amountNum > 0 ? `$${formatMoney(parseUnits(amount))}` : "-"}</span></div>
          <div className="flex justify-between mt-1"><span className="text-text-secondary">Description</span><span className="truncate max-w-[60%] text-right">{description || "-"}</span></div>
        </div>

        <button
          className="btn btn-primary w-full py-2.5"
          disabled={!valid || txState === "pending"}
          onClick={handleSubmit}
        >
          {txState === "pending" ? (
            <span className="inline-block w-4 h-4 border-2 border-background border-t-transparent rounded-full animate-spin" />
          ) : txState === "confirmed" ? (
            <span className="text-background">Created</span>
          ) : (
            "Create Invoice"
          )}
        </button>

        {txState === "error" && <p className="text-sm text-danger">The transaction failed. Check the network and your USDT balance, then try again.</p>}
        {txState === "confirmed" && txHash && <p className="text-xs text-text-secondary">Confirming. Redirecting to your invoice...</p>}
      </div>
    </div>
  );
}