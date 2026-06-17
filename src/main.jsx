import React, { useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import JSZip from "jszip";
import {
  Archive,
  CheckCircle2,
  Download,
  Film,
  ImageDown,
  Loader2,
  Play,
  RefreshCw,
  Scissors,
  Settings2,
  Smartphone,
  Trash2,
  UploadCloud,
} from "lucide-react";
import "./styles.css";

const DEFAULT_SETTINGS = {
  sampleEvery: 0.75,
  diffThreshold: 18,
  minGap: 1.1,
  maxCaptures: 80,
};

const formatTime = (seconds) => {
  if (!Number.isFinite(seconds)) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const fileSize = (bytes) => {
  if (!bytes) return "0 MB";
  const mb = bytes / 1024 / 1024;
  return `${mb.toFixed(mb >= 10 ? 1 : 2)} MB`;
};

const seekVideo = (video, time) =>
  new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("동영상을 읽는 중 문제가 발생했습니다."));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = Math.min(Math.max(time, 0), Math.max(video.duration - 0.05, 0));
  });

const waitForMetadata = (video) =>
  new Promise((resolve, reject) => {
    if (video.readyState >= 1 && Number.isFinite(video.duration)) {
      resolve();
      return;
    }

    const onLoaded = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("동영상 메타데이터를 읽을 수 없습니다."));
    };
    const cleanup = () => {
      video.removeEventListener("loadedmetadata", onLoaded);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("loadedmetadata", onLoaded, { once: true });
    video.addEventListener("error", onError, { once: true });
  });

const getFrameSignature = (canvas, ctx) => {
  const size = 32;
  const sampleCanvas = document.createElement("canvas");
  const sampleCtx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  sampleCanvas.width = size;
  sampleCanvas.height = size;
  sampleCtx.drawImage(canvas, 0, 0, size, size);
  const { data } = sampleCtx.getImageData(0, 0, size, size);
  const signature = new Uint8Array(size * size);

  for (let index = 0, pixel = 0; index < data.length; index += 4, pixel += 1) {
    signature[pixel] = Math.round(data[index] * 0.299 + data[index + 1] * 0.587 + data[index + 2] * 0.114);
  }

  return signature;
};

const getSignatureDiff = (left, right) => {
  if (!left || !right || left.length !== right.length) return Number.POSITIVE_INFINITY;
  let total = 0;
  for (let index = 0; index < left.length; index += 1) {
    total += Math.abs(left[index] - right[index]);
  }
  return total / left.length;
};

const canvasToBlob = (canvas) =>
  new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("이미지를 생성할 수 없습니다."));
    }, "image/png");
  });

function App() {
  const inputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [captures, setCaptures] = useState([]);
  const [selectedIds, setSelectedIds] = useState([]);
  const [status, setStatus] = useState("idle");
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState("화면 녹화 파일을 업로드하면 주요 화면을 자동으로 찾아냅니다.");
  const [dragActive, setDragActive] = useState(false);

  const captureStats = useMemo(() => {
    if (!captures.length) return { first: "-", last: "-", count: 0 };
    return {
      first: formatTime(captures[0].time),
      last: formatTime(captures[captures.length - 1].time),
      count: captures.length,
    };
  }, [captures]);

  const selectedCaptures = useMemo(
    () => captures.filter((capture) => selectedIds.includes(capture.id)),
    [captures, selectedIds],
  );

  const resetResults = () => {
    captures.forEach((capture) => URL.revokeObjectURL(capture.url));
    setCaptures([]);
    setSelectedIds([]);
    setProgress(0);
  };

  const handleFile = (nextFile) => {
    if (!nextFile) return;
    if (!nextFile.type.startsWith("video/")) {
      setMessage("MP4, MOV, WebM 같은 동영상 파일을 선택해주세요.");
      return;
    }

    resetResults();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setFile(nextFile);
    setVideoUrl(URL.createObjectURL(nextFile));
    setStatus("ready");
    setMessage("업로드 완료. 추출 시작을 누르면 화면 전환 지점을 분석합니다.");
  };

  const updateSetting = (key, value) => {
    setSettings((current) => ({
      ...current,
      [key]: value,
    }));
  };

  const extractScreens = async () => {
    if (!file || !videoUrl) {
      inputRef.current?.click();
      return;
    }

    resetResults();
    setStatus("processing");
    setMessage("동영상 프레임을 읽고 중복 화면을 걸러내는 중입니다.");

    const video = document.createElement("video");
    video.src = videoUrl;
    video.muted = true;
    video.preload = "metadata";
    video.playsInline = true;

    try {
      await waitForMetadata(video);

      const width = video.videoWidth;
      const height = video.videoHeight;
      const duration = video.duration;
      if (!width || !height) {
        throw new Error("이 브라우저에서 동영상 프레임을 읽을 수 없습니다. H.264 MP4로 변환한 뒤 다시 업로드해주세요.");
      }

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      canvas.width = width;
      canvas.height = height;

      const totalSamples = Math.max(1, Math.ceil(duration / settings.sampleEvery));
      const nextCaptures = [];
      let previousSignature = null;
      let lastCaptureTime = -Number.POSITIVE_INFINITY;

      for (let sample = 0; sample <= totalSamples; sample += 1) {
        const time = Math.min(sample * settings.sampleEvery, duration);
        await seekVideo(video, time);
        ctx.drawImage(video, 0, 0, width, height);

        const signature = getFrameSignature(canvas, ctx);
        const diff = getSignatureDiff(previousSignature, signature);
        const hasEnoughGap = time - lastCaptureTime >= settings.minGap;
        const shouldCapture =
          sample === 0 || (diff >= settings.diffThreshold && hasEnoughGap && nextCaptures.length < settings.maxCaptures);

        if (shouldCapture) {
          const blob = await canvasToBlob(canvas);
          const url = URL.createObjectURL(blob);
          nextCaptures.push({
            id: `${time.toFixed(2)}-${nextCaptures.length}`,
            blob,
            diff: Number.isFinite(diff) ? diff : 0,
            time,
            url,
            width,
            height,
            name: `screen-${String(nextCaptures.length + 1).padStart(2, "0")}-${formatTime(time).replace(":", "m")}s.png`,
          });
          lastCaptureTime = time;
          previousSignature = signature;
        } else if (!previousSignature || diff >= settings.diffThreshold * 0.55) {
          previousSignature = signature;
        }

        setProgress(Math.round((sample / totalSamples) * 100));
      }

      setCaptures(nextCaptures);
      setSelectedIds(nextCaptures.map((capture) => capture.id));
      setStatus("done");
      setProgress(100);
      setMessage(
        nextCaptures.length
          ? `${nextCaptures.length}개의 화면을 찾았습니다. 결과를 확인한 뒤 ZIP으로 받을 수 있습니다.`
          : "화면을 찾지 못했습니다. 민감도를 낮추거나 샘플 간격을 줄여보세요.",
      );
    } catch (error) {
      setStatus("error");
      setMessage(error.message || "처리 중 오류가 발생했습니다.");
    }
  };

  const downloadOne = (capture) => {
    const link = document.createElement("a");
    link.href = capture.url;
    link.download = capture.name;
    link.click();
  };

  const downloadZip = async (items = selectedCaptures) => {
    if (!items.length) return;
    setStatus("zipping");
    setMessage("ZIP 파일을 준비하는 중입니다.");

    const zip = new JSZip();
    items.forEach((capture) => {
      zip.file(capture.name, capture.blob);
    });
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${file?.name?.replace(/\.[^/.]+$/, "") || "app-screens"}-screenshots.zip`;
    link.click();
    URL.revokeObjectURL(url);
    setStatus("done");
    setMessage("ZIP 다운로드가 준비되었습니다.");
  };

  const toggleCapture = (id) => {
    setSelectedIds((current) =>
      current.includes(id) ? current.filter((selectedId) => selectedId !== id) : [...current, id],
    );
  };

  const toggleAllCaptures = () => {
    setSelectedIds((current) => (current.length === captures.length ? [] : captures.map((capture) => capture.id)));
  };

  const clearAll = () => {
    resetResults();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl("");
    setFile(null);
    setStatus("idle");
    setMessage("화면 녹화 파일을 업로드하면 주요 화면을 자동으로 찾아냅니다.");
  };

  const isProcessing = status === "processing" || status === "zipping";

  return (
    <main className="app-shell">
      <section className="workspace">
        <header className="topbar">
          <div className="brand">
            <div className="brand-mark">
              <Scissors size={19} strokeWidth={2.4} />
            </div>
            <div>
              <h1>App Screen Shot</h1>
              <p>모바일 앱 녹화 영상에서 화면 단위 스크린샷을 자동 추출합니다.</p>
            </div>
          </div>
          <div className="topbar-actions">
            <button className="ghost-button" type="button" onClick={clearAll} disabled={isProcessing || (!file && !captures.length)}>
              <RefreshCw size={16} />
              초기화
            </button>
            <button className="primary-button" type="button" onClick={extractScreens} disabled={isProcessing}>
              {isProcessing ? <Loader2 className="spin" size={17} /> : <Play size={17} />}
              {file ? "추출 시작" : "동영상 선택"}
            </button>
          </div>
        </header>

        <div className="main-grid">
          <aside className="control-panel">
            <button
              className={`upload-zone ${dragActive ? "is-dragging" : ""}`}
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragEnter={(event) => {
                event.preventDefault();
                setDragActive(true);
              }}
              onDragOver={(event) => event.preventDefault()}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => {
                event.preventDefault();
                setDragActive(false);
                handleFile(event.dataTransfer.files?.[0]);
              }}
            >
              <input ref={inputRef} type="file" accept="video/*" onChange={(event) => handleFile(event.target.files?.[0])} />
              <UploadCloud size={28} />
              <strong>{file ? file.name : "화면 녹화 업로드"}</strong>
              <span>{file ? `${fileSize(file.size)} · ${file.type || "video"}` : "MP4, MOV, WebM 파일을 끌어오거나 선택"}</span>
            </button>

            <div className="panel-section">
              <div className="section-title">
                <Settings2 size={17} />
                <h2>추출 설정</h2>
              </div>
              <SettingControl
                label="샘플 간격"
                value={`${settings.sampleEvery.toFixed(2)}초`}
                min="0.25"
                max="2"
                step="0.25"
                current={settings.sampleEvery}
                onChange={(value) => updateSetting("sampleEvery", Number(value))}
              />
              <SettingControl
                label="화면 변화 민감도"
                value={String(settings.diffThreshold)}
                min="6"
                max="40"
                step="1"
                current={settings.diffThreshold}
                onChange={(value) => updateSetting("diffThreshold", Number(value))}
              />
              <SettingControl
                label="최소 캡쳐 간격"
                value={`${settings.minGap.toFixed(1)}초`}
                min="0.5"
                max="4"
                step="0.1"
                current={settings.minGap}
                onChange={(value) => updateSetting("minGap", Number(value))}
              />
              <label className="number-field">
                <span>최대 캡쳐 수</span>
                <input
                  type="number"
                  min="5"
                  max="200"
                  value={settings.maxCaptures}
                  onChange={(event) => updateSetting("maxCaptures", Number(event.target.value))}
                />
              </label>
            </div>

            <div className="status-card">
              <div className="status-row">
                <span className={`status-dot ${status}`} />
                <span>{message}</span>
              </div>
              <div className="progress-track" aria-label="처리 진행률">
                <div style={{ width: `${progress}%` }} />
              </div>
            </div>
          </aside>

          <section className="preview-panel">
            <div className="phone-stage">
              <div className="phone-frame">
                {videoUrl ? (
                  <video src={videoUrl} controls playsInline preload="metadata" />
                ) : (
                  <div className="empty-phone">
                    <Smartphone size={44} />
                    <span>동영상 미리보기</span>
                  </div>
                )}
              </div>
            </div>

            <div className="analysis-strip" aria-label="화면 분석 타임라인">
              <div className="analysis-header">
                <span>화면 분석 타임라인</span>
                <strong>{isProcessing ? `${progress}%` : captures.length ? `${captures.length}개 감지` : "대기 중"}</strong>
              </div>
              <div className="timeline-rail">
                <div className="timeline-progress" style={{ width: `${progress}%` }} />
                {captures.length
                  ? captures.slice(0, 36).map((capture, index) => (
                      <span
                        className="timeline-hit"
                        key={capture.id}
                        style={{ left: `${Math.min(98, Math.max(2, (index / Math.max(captures.length - 1, 1)) * 96 + 2))}%` }}
                      />
                    ))
                  : Array.from({ length: 18 }, (_, index) => <span className="timeline-ghost" key={index} style={{ left: `${6 + index * 5.1}%` }} />)}
              </div>
            </div>

            <div className="summary-strip">
              <SummaryItem icon={<ImageDown size={18} />} label="캡쳐 화면" value={`${captureStats.count}개`} />
              <SummaryItem icon={<Film size={18} />} label="첫 화면" value={captureStats.first} />
              <SummaryItem icon={<CheckCircle2 size={18} />} label="마지막 화면" value={captureStats.last} />
              <button
                className="zip-button"
                type="button"
                onClick={() => downloadZip()}
                disabled={!selectedCaptures.length || isProcessing}
              >
                <Archive size={17} />
                선택 ZIP 받기
              </button>
            </div>
          </section>
        </div>

        <section className="results-panel">
          <div className="results-header">
            <div>
              <h2>추출 결과</h2>
              <p>
                자동 캡쳐된 화면을 선택해서 받을 수 있습니다.
                {captures.length ? ` ${selectedCaptures.length}/${captures.length}개 선택됨` : ""}
              </p>
            </div>
            <div className="results-actions">
              <button className="ghost-button" type="button" onClick={toggleAllCaptures} disabled={!captures.length || isProcessing}>
                <CheckCircle2 size={16} />
                {selectedIds.length === captures.length && captures.length ? "선택 해제" : "전체 선택"}
              </button>
              <button className="ghost-button" type="button" onClick={() => downloadZip(captures)} disabled={!captures.length || isProcessing}>
                <Archive size={16} />
                전체 ZIP
              </button>
              <button className="ghost-button danger" type="button" onClick={resetResults} disabled={!captures.length || isProcessing}>
                <Trash2 size={16} />
                결과 지우기
              </button>
            </div>
          </div>

          {captures.length ? (
            <div className="capture-grid">
              {captures.map((capture, index) => (
                <article className={`capture-card ${selectedIds.includes(capture.id) ? "is-selected" : ""}`} key={capture.id}>
                  <button
                    className="select-toggle"
                    type="button"
                    onClick={() => toggleCapture(capture.id)}
                    aria-pressed={selectedIds.includes(capture.id)}
                    aria-label={`${index + 1}번째 이미지 선택`}
                  >
                    <CheckCircle2 size={17} />
                  </button>
                  <button
                    className="capture-image"
                    type="button"
                    onClick={() => toggleCapture(capture.id)}
                    aria-label={`${index + 1}번째 이미지 선택 전환`}
                  >
                    <img src={capture.url} alt={`${index + 1}번째 캡쳐 화면`} />
                  </button>
                  <div className="capture-meta">
                    <div>
                      <strong>{String(index + 1).padStart(2, "0")}</strong>
                      <span>{formatTime(capture.time)}</span>
                    </div>
                    <button className="download-one" type="button" onClick={() => downloadOne(capture)} aria-label={`${index + 1}번째 이미지 다운로드`}>
                      <Download size={16} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="empty-results">
              <ImageDown size={36} />
              <strong>아직 추출된 화면이 없습니다.</strong>
              <span>녹화 영상을 업로드하고 추출을 시작하면 결과 이미지가 여기에 쌓입니다.</span>
            </div>
          )}
        </section>
      </section>
    </main>
  );
}

function SettingControl({ label, value, min, max, step, current, onChange }) {
  return (
    <label className="setting-control">
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <input type="range" min={min} max={max} step={step} value={current} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function SummaryItem({ icon, label, value }) {
  return (
    <div className="summary-item">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
