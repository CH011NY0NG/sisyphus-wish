import { useState } from "react";
// import ContentList from "./components/ContentList";
import Scene from "./components/Scene";
import MountainControls from "./components/MountainControls";
import {
  DEFAULT_MOUNTAIN_PARAMS,
  type MountainParams,
} from "./lib/mountain";
import "./App.css";

export default function App() {
  const [params, setParams] = useState<MountainParams>(DEFAULT_MOUNTAIN_PARAMS);

  return (
    <div className="app-shell">
      <section className="scene-area" aria-label="3D 씬">
        <Scene params={params} />
      </section>

      <section className="content-area" aria-label="컨텐츠">
        <MountainControls params={params} onChange={setParams} />
        {/* <ContentList /> */}
      </section>
    </div>
  );
}