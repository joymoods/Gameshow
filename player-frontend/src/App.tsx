import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom';
import JoinPage from './pages/JoinPage';
import WaitingPage from './pages/WaitingPage';
import GamePage from './pages/GamePage';
import EndPage from './pages/EndPage';
import './App.css';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<JoinPage />} />
        <Route path="/waiting" element={<WaitingPage />} />
        <Route path="/game" element={<GamePage />} />
        <Route path="/end" element={<EndPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
