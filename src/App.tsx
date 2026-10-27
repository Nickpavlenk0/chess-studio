import { useState } from "react";
import { HashRouter, NavLink, Link, Routes, Route } from "react-router-dom";
import {
  BookOpen,
  ChartNoAxesCombined,
  ChevronRight,
  Crosshair,
  Home,
  LogIn,
  LogOut,
  Moon,
  Sun,
  Settings2,
  GitBranch,
  Menu,
  X,
} from "lucide-react";
import { StudioProvider, useStudio } from "./StudioContext";
import { contentErrors } from "./lib/content";
import Dashboard from "./pages/Dashboard";
import { Training, PuzzlePage, Diagnostic } from "./pages/Training";
import { OpeningCatalog, OpeningPage } from "./pages/Openings";
import Analysis from "./pages/Analysis";
import Progress from "./pages/Progress";
const nav = [
  { to: "/", icon: Home, label: "Главная" },
  { to: "/training", icon: Crosshair, label: "Тренировки" },
  { to: "/openings", icon: BookOpen, label: "Дебюты" },
  { to: "/analysis", icon: GitBranch, label: "Анализ" },
  { to: "/progress", icon: ChartNoAxesCombined, label: "Прогресс" },
];
function Layout() {
  const s = useStudio();
  const [settings, setSettings] = useState(false);
  const [mobileMenu, setMobileMenu] = useState(false);
  return (
    <div className="app-shell">
      <aside className={"sidebar " + (mobileMenu ? "open" : "")}>
        <Link to="/" className="brand" onClick={() => setMobileMenu(false)}>
          <span className="brand-mark">♞</span>
          <span>
            chess<span className="brand-light">studio</span>
            <small>ПЕРСОНАЛЬНАЯ АКАДЕМИЯ</small>
          </span>
        </Link>
        <div className="nav-label">ВАШЕ ПРОСТРАНСТВО</div>
        <nav aria-label="Основная навигация">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              onClick={() => setMobileMenu(false)}
            >
              <n.icon size={20} />
              <span>{n.label}</span>
              {n.to === "/training" && <small>15</small>}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="sidebar-quote">
            <span>“</span>Хороший ход начинается
            <br />с хорошего вопроса.
            <small>ИССЛЕДУЙТЕ. ПОНИМАЙТЕ. ИГРАЙТЕ.</small>
          </div>
          <div className="profile">
            <div className="avatar">♔</div>
            <div>
              <strong>Ваша академия</strong>
              <small>Вдумчивая практика</small>
            </div>
            <span className="online-dot" />
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Открыть меню"
            onClick={() => setMobileMenu((v) => !v)}
          >
            {mobileMenu ? <X /> : <Menu />}
          </button>
          <div className="top-breadcrumb">
            Личное пространство <ChevronRight size={14} />{" "}
            <span>Chess Studio</span>
          </div>
          <div className="top-actions">
            <span
              className={"cloud-status " + (s.authenticated ? "connected" : "")}
            >
              <span />
              {s.loading
                ? "Загрузка…"
                : s.authenticated
                  ? "GitHub подключён"
                  : s.configured
                    ? "Гостевой режим"
                    : "Облако не настроено"}
            </span>
            <button
              className="icon-button"
              aria-label="Переключить тему"
              onClick={() => s.setTheme(s.theme === "light" ? "dark" : "light")}
            >
              {s.theme === "light" ? <Moon size={19} /> : <Sun size={19} />}
            </button>
            <button
              className="icon-button"
              aria-label="Настройки"
              onClick={() => setSettings((v) => !v)}
            >
              <Settings2 size={19} />
            </button>
          </div>
        </header>
        {settings && (
          <div className="settings-panel">
            <strong>Ваша доска</strong>
            <label>
              Оформление{" "}
              <select
                value={s.boardTheme}
                onChange={(e) => s.setBoardTheme(e.target.value)}
              >
                <option value="sage">Шалфей</option>
                <option value="walnut">Орех</option>
                <option value="slate">Сланец</option>
              </select>
            </label>
            <span className="tiny">Настройки действуют в текущей вкладке.</span>
            {s.authenticated ? (
              <button className="text-button" onClick={s.logout}>
                <LogOut size={16} /> Выйти
              </button>
            ) : (
              s.configured && (
                <button className="text-button" onClick={s.login}>
                  <LogIn size={16} /> Войти через GitHub
                </button>
              )
            )}
          </div>
        )}
        <main>
          {s.pending.some((p) => p.state !== "saved") && (
            <div className="pending-banner" role="status">
              <span>
                {s.pending.some((p) => p.state === "error")
                  ? "Ошибка синхронизации"
                  : "Сохраняется…"}{" "}
                · Неподтверждённых результатов:{" "}
                {s.pending.filter((p) => p.state !== "saved").length}
              </span>
              <Link to="/progress">Открыть журнал →</Link>
            </div>
          )}
          {contentErrors.length > 0 && (
            <div className="feedback">
              Не удалось загрузить часть материалов ({contentErrors.length}).
              Остальные уроки доступны.
            </div>
          )}
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/training" element={<Training />} />
            <Route path="/training/:id" element={<PuzzlePage />} />
            <Route path="/diagnostic" element={<Diagnostic />} />
            <Route path="/openings" element={<OpeningCatalog />} />
            <Route path="/openings/:id" element={<OpeningPage />} />
            <Route path="/analysis" element={<Analysis />} />
            <Route path="/progress" element={<Progress />} />
            <Route
              path="*"
              element={
                <div className="empty">
                  <h1>Страница не найдена</h1>
                  <Link to="/">Вернуться в академию</Link>
                </div>
              }
            />
          </Routes>
        </main>
        <footer className="footer">
          <span>CHESS STUDIO</span> Шаг за шагом к пониманию шахмат.
          <a
            href="https://github.com/Nickpavlenk0/chess-studio"
            target="_blank"
            rel="noreferrer"
          >
            Код и учебные материалы ↗
          </a>
        </footer>
      </div>
      <nav className="bottom-nav" aria-label="Мобильная навигация">
        {nav.map((n) => (
          <NavLink to={n.to} key={n.to} end={n.to === "/"}>
            <n.icon size={20} />
            <span>{n.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
export default function App() {
  return (
    <StudioProvider>
      <HashRouter>
        <Layout />
      </HashRouter>
    </StudioProvider>
  );
}
