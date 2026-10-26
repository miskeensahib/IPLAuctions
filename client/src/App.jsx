import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import Layout from './Layout';
import { ToastProvider } from './state';
import Home, { Welcome } from './pages/Home';
import Dashboard from './pages/Dashboard';
import Players from './pages/Players';
import Watchlist from './pages/Watchlist';
import Admin, { Settings } from './pages/Admin';
import { Bids, History, Live, Reports, Squad, Teams } from './pages/AuctionPages';

export default function App() {
  return (
    <BrowserRouter>
      <ToastProvider>
        <Routes>
          <Route path="/" element={<Welcome />} />
          <Route element={<Layout />}>
            <Route path="/home" element={<Home />} />
            <Route path="/players" element={<Players />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/a/:code">
              <Route index element={<Dashboard />} />
              <Route path="live" element={<Live />} />
              <Route path="players" element={<Players />} />
              <Route path="teams" element={<Teams />} />
              <Route path="squad" element={<Squad />} />
              <Route path="bids" element={<Bids />} />
              <Route path="history" element={<History />} />
              <Route path="watchlist" element={<Watchlist />} />
              <Route path="reports" element={<Reports />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ToastProvider>
    </BrowserRouter>
  );
}
