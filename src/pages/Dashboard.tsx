import { Link } from "react-router-dom";
import { Chess } from "chess.js";
import {
  ChartNoAxesCombined,
  ArrowRight,
  BookOpen,
  Crosshair,
  GraduationCap,
  Sparkles,
  Swords,
  ChevronRight,
} from "lucide-react";
import { useStudio } from "../StudioContext";
import { summarize } from "../lib/progress";
import { playUci } from "../lib/chess";
import { puzzles, openings } from "../lib/content";
import Board from "../components/Board";
import { Metric, CloudNotice, Recent } from "../components/Ui";
export default function Dashboard() {
  const s = useStudio();
  const stats = summarize(s.events);
  const last = s.events.at(-1);
  const course = openings[0];
  const preview = new Chess();
  ["e2e4", "e7e5", "g1f3", "b8c6", "c2c3"].forEach((m) => playUci(preview, m));
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">ВАША ШАХМАТНАЯ АКАДЕМИЯ</div>
          <h1>
            Каждый ход —<br className="mobile-only" /> шаг вперёд
            <span className="accent-dot">.</span>
          </h1>
          <p>Меньше спешки. Больше понимания.</p>
        </div>
        <div className="date-pill">
          <GraduationCap size={17} /> Уровень 1000–1200
        </div>
      </div>
      <div className="dashboard-grid">
        <section className="hero-card">
          <div className="hero-copy">
            <span className="pill">
              <span /> {last ? "ПРОДОЛЖИТЬ ОБУЧЕНИЕ" : "ВАШ СЛЕДУЮЩИЙ ШАГ"}
            </span>
            <h2>
              Понимайте игру.
              <br />
              <em>Не просто ходы.</em>
            </h2>
            <p>
              {last
                ? `Последнее занятие: ${openings.find((o) => o.id === last.contentId)?.title || puzzles.find((p) => p.id === last.contentId)?.title || "Тренировка"}. Вернитесь к практике и закрепите результат.`
                : "Начните с короткой диагностики. Узнайте, что уже получается, а чему стоит уделить внимание."}
            </p>
            <Link
              className="button"
              to={
                last?.kind === "opening"
                  ? `/openings/${last.contentId}`
                  : last?.mode === "diagnostic"
                    ? "/diagnostic?resume=1"
                    : last
                      ? `/training/${last.contentId}`
                      : "/diagnostic"
              }
            >
              {last ? "Продолжить занятие" : "Пройти диагностику"}
              <ArrowRight size={18} />
            </Link>
            <div className="hero-meta">
              <span>15 позиций</span>
              <span>В своём темпе</span>
              <span>Без оценки Elo</span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <span className="hero-knight">♞</span>
            <div className="art-caption">МЫСЛИТЬ НА ХОД ВПЕРЁД</div>
          </div>
        </section>
        <section className="daily-card">
          <div className="section-label">
            <span className="eyebrow">ДЕБЮТ В ФОКУСЕ</span>
            <span className="badge">За белых</span>
          </div>
          <Link to={`/openings/${course.id}`} className="daily-link">
            <h3>{course.title}</h3>
            <p>
              {course.subtitle} <ArrowRight size={16} />
            </p>
          </Link>
          <div className="mini-board">
            <Board
              fen={preview.fen()}
              interactive={false}
              theme={s.boardTheme}
              lastMove={["c2", "c3"]}
              arrows={[["d2", "d4"]]}
            />
          </div>
          <Link to={`/openings/${course.id}`} className="text-button">
            Открыть интерактивный урок <ChevronRight size={15} />
          </Link>
        </section>
        <div className="metrics">
          <Metric
            label="Выполнено задач"
            value={stats.total.toString()}
            note="подтверждено облаком"
            icon={<Crosshair size={20} />}
          />
          <Metric
            label="С первой попытки"
            value={stats.total ? `${stats.firstPercent}%` : "—"}
            note="без ошибок и подсказок"
            icon={<Sparkles size={20} />}
          />
          <Metric
            label="Дебютов закреплено"
            value={`${stats.openings.length} / ${openings.length}`}
            note="воспроизведено по памяти"
            icon={<BookOpen size={20} />}
          />
        </div>
        <section className="training-block">
          <div className="section-title">
            <h2>Время для практики</h2>
            <Link to="/training">
              Все тренировки <ArrowRight size={16} />
            </Link>
          </div>
          <div className="training-cards">
            <Link to="/diagnostic" className="training-card">
              <span className="tile-icon peach">
                <Crosshair />
              </span>
              <span className="tiny">ТОЧКА ОТСЧЁТА</span>
              <h3>Диагностика</h3>
              <p>
                15 позиций, чтобы увидеть
                <br />
                свои сильные стороны.
              </p>
              <div>
                <span>15 заданий</span>
                <ArrowRight size={18} />
              </div>
            </Link>
            <Link to="/training" className="training-card">
              <span className="tile-icon sage">
                <Swords />
              </span>
              <span className="tiny">ШАХМАТНОЕ ЗРЕНИЕ</span>
              <h3>Тактика и расчёт</h3>
              <p>
                Вилки, связки, угрозы.
                <br />
                Учитесь замечать главное.
              </p>
              <div>
                <span>В своём темпе</span>
                <ArrowRight size={18} />
              </div>
            </Link>
            <Link to="/openings" className="training-card">
              <span className="tile-icon lilac">
                <BookOpen />
              </span>
              <span className="tiny">УВЕРЕННОЕ НАЧАЛО</span>
              <h3>Школа дебютов</h3>
              <p>
                Изучайте идеи и проверяйте
                <br />
                линии на доске.
              </p>
              <div>
                <span>5 дебютов</span>
                <ArrowRight size={18} />
              </div>
            </Link>
          </div>
        </section>
        <section className="recent-card">
          <div className="section-title">
            <h2>Последние результаты</h2>
            <Link to="/progress">
              История <ArrowRight size={15} />
            </Link>
          </div>
          {s.events.length ? (
            <Recent events={s.events.slice(-3).reverse()} />
          ) : (
            <div className="empty compact-empty">
              <ChartNoAxesCombined size={32} />
              <h3>Здесь начнётся ваша история</h3>
              <p>
                После первой сохранённой тренировки
                <br />
                появятся результаты и наблюдения.
              </p>
            </div>
          )}
        </section>
      </div>
      <CloudNotice />
    </>
  );
}
