import { useEffect, useState } from "react";
import { useBlockNumber, useWatchContractEvent } from "wagmi";
import { Link } from "react-router-dom";
import { INVOICE_FACTORY_ADDRESS } from "../config/network";
import { INVOICE_ABI } from "../hooks/useInvoiceFactory";
import { formatDate, truncateAddress } from "../lib/format";

const LABELS = {
  InvoiceCreated: "Invoice created",
  InvoiceConfirmed: "Invoice confirmed",
  InvoiceTokenized: "Invoice tokenized",
  InvestmentMade: "Investment made",
  InvoiceRepaid: "Invoice repaid",
  InvoicePaidDirect: "Invoice paid directly",
  InvoiceDefaulted: "Invoice defaulted",
  InvestorClaimed: "Investor claimed",
  SellerClaimed: "Seller claimed",
  StakeReturned: "Stake returned",
  UsernameClaimed: "Username claimed",
  TrustedStatusGranted: "Trusted status granted",
};

export default function Activity() {
  const { data: blockNumber } = useBlockNumber({ watch: true });
  const [events, setEvents] = useState([]);

  useWatchContractEvent({
    address: INVOICE_FACTORY_ADDRESS,
    abi: INVOICE_ABI,
    eventName: "InvoiceCreated",
    onLogs: (logs) => addLogs(logs),
  });
  useWatchContractEvent({
    address: INVOICE_FACTORY_ADDRESS,
    abi: INVOICE_ABI,
    eventName: "InvestmentMade",
    onLogs: (logs) => addLogs(logs),
  });
  useWatchContractEvent({
    address: INVOICE_FACTORY_ADDRESS,
    abi: INVOICE_ABI,
    eventName: "InvoiceRepaid",
    onLogs: (logs) => addLogs(logs),
  });
  useWatchContractEvent({
    address: INVOICE_FACTORY_ADDRESS,
    abi: INVOICE_ABI,
    eventName: "InvoiceDefaulted",
    onLogs: (logs) => addLogs(logs),
  });
  useWatchContractEvent({
    address: INVOICE_FACTORY_ADDRESS,
    abi: INVOICE_ABI,
    eventName: "InvoiceTokenized",
    onLogs: (logs) => addLogs(logs),
  });
  useWatchContractEvent({
    address: INVOICE_FACTORY_ADDRESS,
    abi: INVOICE_ABI,
    eventName: "InvoicePaidDirect",
    onLogs: (logs) => addLogs(logs),
  });
  useWatchContractEvent({
    address: INVOICE_FACTORY_ADDRESS,
    abi: INVOICE_ABI,
    eventName: "TrustedStatusGranted",
    onLogs: (logs) => addLogs(logs),
  });

  function addLogs(logs) {
    for (const log of logs) {
      const name = log.eventName;
      const id = Number(log.args.invoiceId ?? 0n);
      const ts = Number(log.args.timestamp ?? 0n);
      const actor = log.args.buyer ?? log.args.seller ?? log.args.investor ?? log.args.user ?? "";
      setEvents((prev) => [{ name, id, actor, ts }, ...prev].slice(0, 60));
    }
  }

  useEffect(() => {
    setEvents([]);
  }, []);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-xl font-semibold">Live Activity</h1>
        <div className="flex items-center gap-2 text-sm text-text-secondary">
          <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          <span className="tabular">Block {blockNumber?.toString()}</span>
        </div>
      </div>

      <div className="card p-4 space-y-2">
        {events.length === 0 ? (
          <p className="text-text-secondary text-sm">Watching for events. New on-chain activity will appear here in real time.</p>
        ) : (
          events.map((e, i) => (
            <div key={i} className="flex items-center justify-between text-sm border-b border-border last:border-0 py-2">
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs text-text-secondary whitespace-nowrap">{LABELS[e.name] || e.name}</span>
                {e.actor && <span className="font-mono text-xs text-text-secondary truncate">{truncateAddress(e.actor)}</span>}
                {e.id !== undefined && <Link to={`/invoice/${e.id}`} className="font-mono text-xs text-primary hover:underline">#{e.id.toString()}</Link>}
              </div>
              {e.ts > 0 && <span className="text-xs text-text-secondary whitespace-nowrap">{formatDate(e.ts)}</span>}
            </div>
          ))
        )}
      </div>
    </div>
  );
}