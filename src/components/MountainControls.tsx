import {
  DEFAULT_MOUNTAIN_PARAMS,
  type MountainParams,
} from "../lib/mountain";

type SliderDef = {
  key: keyof MountainParams;
  label: string;
  min: number;
  max: number;
  step: number;
};

type BoolDef = {
  key: keyof MountainParams;
  label: string;
};

type ColorDef = {
  key: keyof MountainParams;
  label: string;
};

const SLIDERS: SliderDef[] = [
  { key: "xSeg", label: "가로 패싯", min: 16, max: 192, step: 8 },
  { key: "zSeg", label: "세로 패싯", min: 2, max: 48, step: 2 },
  { key: "depth", label: "산 깊이", min: 32, max: 96, step: 4 },
  { key: "rockAmplitude", label: "바위 요철", min: 0, max: 20, step: 0.5 },
  { key: "detailFreq", label: "지형 밀도", min: 0.25, max: 3, step: 0.05 },
  { key: "rockFreq", label: "바위 밀도", min: 0.25, max: 3, step: 0.05 },
  { key: "falloffPower", label: "깊이 감쇠 곡선", min: 0.5, max: 3, step: 0.05 },
  { key: "rimStrength", label: "림 강도", min: 0, max: 3, step: 0.05 },
  { key: "rimPower", label: "림 굴곡", min: 0.5, max: 6, step: 0.1 },
  { key: "rockRadius", label: "돌 크기", min: 0, max: 8, step: 0.1 },
  { key: "rockDetail", label: "돌 패싯", min: 0, max: 4, step: 1 },
  { key: "rockRough", label: "돌 요철", min: 0, max: 1, step: 0.05 },
  { key: "rockGlow", label: "돌 표면 발광", min: 0, max: 300, step: 5 },
];

const BOOLS: BoolDef[] = [
  { key: "rockEnabled", label: "돌 활성화" },
];

const COLORS: ColorDef[] = [
  { key: "baseColor", label: "산색" },
  { key: "rimColor", label: "림 색" },
  { key: "rockColor", label: "돌 색" },
];

type MountainControlsProps = {
  params: MountainParams;
  onChange: (next: MountainParams) => void;
};

export default function MountainControls({
  params,
  onChange,
}: MountainControlsProps) {
  const set = (key: keyof MountainParams, value: number | string | boolean) =>
    onChange({ ...params, [key]: value } as MountainParams);

  return (
    <div className="mountain-controls">
      <button
        type="button"
        className="mountain-controls-reset"
        onClick={() => onChange(DEFAULT_MOUNTAIN_PARAMS)}
      >
        기본값으로 리셋
      </button>

      <div className="mountain-controls-group">지형</div>
      {SLIDERS.map((c) => (
        <label key={c.key} className="mountain-control">
          <span className="mountain-control-label">{c.label}</span>
          <input
            type="range"
            min={c.min}
            max={c.max}
            step={c.step}
            value={params[c.key] as number}
            onChange={(e) => set(c.key, Number(e.target.value))}
          />
          <output>{params[c.key] as number}</output>
        </label>
      ))}

      <div className="mountain-controls-group">돌</div>
      {BOOLS.map((c) => (
        <label key={c.key} className="mountain-control mountain-control-bool">
          <span className="mountain-control-label">{c.label}</span>
          <input
            type="checkbox"
            checked={params[c.key] as boolean}
            onChange={(e) => set(c.key, e.target.checked)}
          />
        </label>
      ))}

      <div className="mountain-controls-group">색상 / 조명</div>
      {COLORS.map((c) => (
        <label key={c.key} className="mountain-control mountain-control-color">
          <span className="mountain-control-label">{c.label}</span>
          <input
            type="color"
            value={params[c.key] as string}
            onChange={(e) => set(c.key, e.target.value)}
          />
          <output>{params[c.key] as string}</output>
        </label>
      ))}
    </div>
  );
}