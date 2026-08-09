import { BrowserRouter as Router, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useEffect } from 'react';
import LandingPage from './pages/LandingPage';
import RoomPage from './pages/RoomPage';

// Компонент для обработки startapp параметра из Telegram
function StartAppHandler() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Проверяем startapp параметр из Telegram WebApp
    const tg = window.Telegram?.WebApp;
    const startParam = tg?.initDataUnsafe?.start_param;

    if (startParam && !location.pathname.startsWith('/room/')) {
      // Автоматически переходим в комнату
      navigate(`/room/${startParam}`, { replace: true });
    }
  }, [navigate, location.pathname]);

  return null;
}

function App() {
  return (
    <Router>
      <StartAppHandler />
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/room/:roomId" element={<RoomPage />} />
      </Routes>
    </Router>
  );
}

export default App;