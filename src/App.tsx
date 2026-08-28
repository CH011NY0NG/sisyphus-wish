import Scene from "./components/Scene";
import "./App.css";

export default function App() {
  return (
    <div className="app-shell">
      <section className="scene-area" aria-label="3D 씬">
        <Scene />
      </section>
    </div>
  );
}