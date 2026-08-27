import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import { ToastProvider } from "./components/Toast";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import CreateInvoice from "./pages/CreateInvoice";
import InvoiceDetail from "./pages/InvoiceDetail";
import Marketplace from "./pages/Marketplace";
import Profile from "./pages/Profile";
import Settings from "./pages/Settings";
import Documentation from "./pages/Documentation";
import Activity from "./pages/Activity";

export default function App() {
  return (
    <ToastProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/create" element={<CreateInvoice />} />
          <Route path="/invoice/:id" element={<InvoiceDetail />} />
          <Route path="/marketplace" element={<Marketplace />} />
          <Route path="/profile/:address" element={<Profile />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/docs" element={<Documentation />} />
          <Route path="/activity" element={<Activity />} />
          <Route path="*" element={<Landing />} />
        </Route>
      </Routes>
    </ToastProvider>
  );
}