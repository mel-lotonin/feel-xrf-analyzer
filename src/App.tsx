import {useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import "./App.css";

import {Image as KImage, Layer, Line, Stage} from "react-konva";
import './ColorMaps.tsx'
import {Color, MasoudMap} from "./ColorMaps.tsx";
import Konva from "konva";
import {getCurrentWebviewWindow, WebviewWindow} from "@tauri-apps/api/webviewWindow";
import {Sample, SampleInfoCard, SampleShape, SampleType, SampleCanvas} from "./Sample.tsx";


export interface CalibrationCurve {
    slope: number,
    int: number,
    r: number
}

function lerpColor(c1: Color, c2: Color, t: number): Color {
    // Clamp t between 0 and 1
    t = Math.max(0, Math.min(1, t));

    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    const a = Math.round(c1.a + (c2.a - c1.a) * t);

    return {r, g, b, a};
}

function gradientLerp(colors: Color[], t: number): Color {
    // Clamp t between 0 and 1
    t = Math.max(0, Math.min(1, t));

    const steps = colors.length - 1;
    const scaledT = t * steps;
    const idx = Math.floor(scaledT);
    const localT = scaledT - idx;

    const c1 = colors[idx];
    const c2 = colors[Math.min(idx + 1, steps)];

    return lerpColor(c1, c2, localT);
}

function calculateRegression(points: { x: number, y: number }[]): CalibrationCurve | undefined {
    const n = points.length;
    if (n < 2) return undefined;

    const sumX = points.reduce((acc, p) => acc + p.x, 0);
    const sumY = points.reduce((acc, p) => acc + p.y, 0);
    const sumXY = points.reduce((acc, p) => acc + p.x * p.y, 0);
    const sumX2 = points.reduce((acc, p) => acc + p.x * p.x, 0);
    const sumY2 = points.reduce((acc, p) => acc + p.y * p.y, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const int = (sumY - slope * sumX) / n;
    const r = (n * sumXY - sumX * sumY) / Math.sqrt((n * sumX2 - sumX ** 2) * (n * sumY2 - sumY ** 2));

    return {slope, int, r};
}

function App() {
    const [map, setMap] = useState<number[][] | null>(null);

    const [img, setImg] = useState<HTMLImageElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement>(document.createElement("canvas"));

    const [drawMode, setDrawMode] = useState<SampleShape | null>(null);

    const [samples, setSamples] = useState<Sample[]>([]);
    const [tempSample, setTempSample] = useState<Sample | null>(null);

    const calibrationCurve = calculateRegression(samples
        .filter(r => r.type === SampleType.Reference && r.loading !== null && r.counts(map!) !== null)
        .map(r => ({
            x: r.counts(map!)!,
            y: r.loading!
    })));

    const [gridSize, setGridSize] = useState<number>(20);
    const [gridStroke, setGridStroke] = useState<number>(0);

    const width = map ? map[0].length : 0;
    const height = map ? map.length : 0;
    const cellSize = 2;


    async function handleLoadMap() {
        try {
            const mapFile = await open({
                multiple: false,
                filters: [{
                    name: 'XRF Count File',
                    extensions: ['txt', 'csv'],
                }]
            });

            if (typeof mapFile === 'string') {
                console.log("Selected map:", mapFile);

                const counts = await invoke<number[][] | string>('load_map', {path: mapFile})
                if (typeof counts === 'string') {
                    console.log(counts);
                } else {
                    setMap(counts)
                }
            } else {
                console.log("No map file found!", typeof mapFile, mapFile);
            }
        } catch (e) {
            console.error("Failed to open map file", e);
        }
    }

    useEffect(() => {
        if (!map) return;
        /* ==================================================
        Draw Heatmap
        ================================================== */
        const canvas = canvasRef.current;
        canvas.width = width * 2;
        canvas.height = height * 2;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.error("Failed to initialize canvas context");
            return
        }

        const imageData = ctx.createImageData(width * cellSize, height * cellSize);
        let maxValue = -Infinity;
        let minValue = Infinity;

        for (const row of map) {
            for (const value of row) {
                if (value > maxValue) maxValue = value;
                if (value < minValue) minValue = value;
            }
        }

        for (let y = 0; y < height * cellSize; y++) {
            for (let x = 0; x < width * cellSize; x++) {
                const val = map[Math.floor(y / cellSize)][Math.floor(x / cellSize)];
                const ratio = (val - minValue) / (maxValue - minValue);
                const index = (y * width * cellSize + x) * 4;

                const color = gradientLerp(MasoudMap, ratio)

                imageData.data[index] = color.r;     // R
                imageData.data[index + 1] = color.g;     // G
                imageData.data[index + 2] = color.b;     // B
                imageData.data[index + 3] = color.a;   // Alpha
            }
        }

        ctx.putImageData(imageData, 0, 0);

        const image = new window.Image();
        image.onload = () => setImg(image);
        image.src = canvas.toDataURL();
    }, [map]);

    useEffect(() => {
        setSamples([])
        setTempSample(null)
    }, [map]);

    const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const pos = e.target.getStage()?.getPointerPosition();
        if (!pos) return;

        if (drawMode === SampleShape.Circle) {
            setTempSample(Sample.createCircle(
                Math.floor(pos.x / cellSize),
                Math.floor(pos.y / cellSize),
                1
            ));
        } else if (drawMode === SampleShape.Rect) {
            setTempSample(Sample.createRect(
                Math.floor(pos.x / cellSize),
                Math.floor(pos.y / cellSize),
                1,
                1
            ));
        }
    };

    const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (drawMode === null) return;

        const pos = e.target.getStage()?.getPointerPosition();
        if (!pos) return;

        if (drawMode === SampleShape.Circle && tempSample) {
            const dx = pos.x - tempSample.x * cellSize;
            const dy = pos.y - tempSample.y * cellSize;
            const radius = Math.sqrt(dx * dx + dy * dy);

            setTempSample(prev => (Sample.createCircle(prev!.x, prev!.y, Math.floor(radius / cellSize))));
        } else if (drawMode === SampleShape.Rect && tempSample) {
            const dx = pos.x - tempSample.x * cellSize;
            const dy = pos.y - tempSample.y * cellSize;

            setTempSample(prev => (Sample.createRect(prev!.x, prev!.y, Math.floor(dx / cellSize), Math.floor(dy / cellSize))));
        }
    };

    const onMouseUp = () => {
        if (drawMode === SampleShape.Circle && tempSample) {
            setSamples(prev => {
                return [...prev, tempSample]
            });
            setTempSample(null);
            setDrawMode(null);
        } else if (drawMode === SampleShape.Rect && tempSample) {
            let x = tempSample.x;
            let y = tempSample.y;
            let width = tempSample.w!;
            let height = tempSample.h!;

            if (width < 0) {
                x += width;
                width = Math.abs(width);
            }

            if (height < 0) {
                y += height;
                height = Math.abs(height);
            }

            setSamples((prev => ([...prev, Sample.createRect(
                x, y, width, height
            )])));
            setTempSample(null)
            setDrawMode(null);
        }
    };


    function onDrawCircleClicked() {
        if (drawMode === SampleShape.Circle) {
            setDrawMode(null);
        } else {
            setDrawMode(SampleShape.Circle);
        }
    }

    function onDrawRectClicked() {
        if (drawMode === SampleShape.Rect) {
            setDrawMode(null);
        } else {
            setDrawMode(SampleShape.Rect);
        }
    }

    async function startAnalyze() {
        const analyzeWindow = new WebviewWindow('analyzeWindow', {
            url: '/autodetect.html',
            title: 'Autodetect Objects',
            parent: getCurrentWebviewWindow()
        });

        analyzeWindow.once('tauri://error', function (e) {
            console.error("Failed to create window", e);
        });

        analyzeWindow.once('tauri://created', () => {
            analyzeWindow.once('feel://analyzeReady', () => {
                analyzeWindow.emit('feel://analyzeStart', map!);
            })
        });
    }

    function onSampleUpdate(idx: number, value: Sample) {
        setSamples(prev => {
            const copy = [...prev];
            copy[idx] = value;
            return copy;
        })
    }

    return (
        <>
            <header>
                <nav
                    className="navbar navbar-expand-sm navbar-toggleable-sm navbar-light bg-white border-bottom box-shadow mb-3">
                    <div className="container">
                        <a className="navbar-brand" href="/">FEEL XRF Analyzer</a>
                        <button className="navbar-toggler" type="button" data-bs-toggle="collapse"
                                data-bs-target=".navbar-collapse" aria-controls="navbarSupportedContent"
                                aria-expanded="false" aria-label="Toggle navigation">
                            <span className="navbar-toggler-icon"></span>
                        </button>
                        <div className="navbar-collapse collapse d-sm-inline-flex justify-content-between">
                        </div>
                    </div>
                </nav>
            </header>
            <div className="container">
                <main role="main" className="pb-3">
                    <div className="row">
                        <div className="col">
                            {map && (
                                <div className="card" style={{width: width * cellSize + 'px'}}>
                                    <Stage className="card-img" width={width * cellSize} height={height * cellSize}
                                           onMouseUp={onMouseUp}
                                           onMouseMove={onMouseMove} onMouseDown={onMouseDown}>
                                        <Layer>
                                            {img && <KImage image={img}/>}
                                            {tempSample && <SampleCanvas index={-1} data={tempSample} cellSize={cellSize}/>}
                                            {samples.map((sample, idx) =>
                                                <SampleCanvas key={`sample-${idx}`} index={idx} data={sample} cellSize={cellSize} onUpdate={value => onSampleUpdate(idx, value)}/>
                                            )}
                                            {Array.from({length: width}).map((_, i) => (
                                                <Line
                                                    key={`v-${i}`}
                                                    points={[i * gridSize, 0, i * gridSize, height * gridSize]}
                                                    stroke="rgba(0,0,0,1)"
                                                    strokeWidth={gridStroke}
                                                />
                                            ))}

                                            {Array.from({length: height}).map((_, i) => (
                                                <Line
                                                    key={`h-${i}`}
                                                    points={[0, i * gridSize, width * gridSize, i * gridSize]}
                                                    stroke="rgba(0,0,0,1)"
                                                    strokeWidth={gridStroke}
                                                />
                                            ))}
                                        </Layer>
                                    </Stage>
                                    <div className="card-body">
                                        <h5 className="card-title">Map Details</h5>
                                        <span className="card-text">
                                            Dimensions: {map[0].length}x{map.length}
                                            <br/>
                                            <strong>Slope:</strong> {calibrationCurve?.slope ?? ">=2 references needed"}
                                            <br/>
                                            <strong>Y-intercept:</strong> {calibrationCurve?.int ?? '>=2 references needed'}
                                            <br/>
                                            <strong>r:</strong> {calibrationCurve?.r ?? ">=2 references needed"}
                                        </span>
                                        <div className="input-group">
                                            <button
                                                className={"btn btn" + (drawMode === SampleShape.Circle ? "-outline" : "") + "-primary"}
                                                onClick={onDrawCircleClicked}>Draw Circle
                                            </button>
                                            <button
                                                className={"btn btn" + (drawMode === SampleShape.Rect ? "-outline" : "") + "-success"}
                                                onClick={onDrawRectClicked}>Draw Rect
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <br/>
                            <div className="card mb-3" style={{width: '600px'}}>
                                <div className="card-body">
                                    <h5 className="card-title">Settings</h5>

                                    <div className="mb-3">
                                        <button className="btn btn-outline-primary" onClick={handleLoadMap}>
                                            Load Map
                                        </button>
                                        <button className="btn btn-success" disabled={map === null}
                                                onClick={(_) => startAnalyze()}>Analyze
                                        </button>
                                    </div>

                                    <div className="input-group">
                                        <span className="input-group-text">Grid Size</span>
                                        <input
                                            type="number"
                                            className="form-control"
                                            value={gridSize}
                                            onChange={(e) => setGridSize(Math.max(1, parseInt(e.target.value)))}
                                            min={1}
                                        />
                                    </div>
                                    <div className="input-group">
                                        <span className="input-group-text">Grid Width</span>
                                        <input type="number" className="form-control" value={gridStroke}
                                               onChange={(e) => setGridStroke(Math.max(0, parseInt(e.target.value)))}/>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {map && (
                            <div className="col">
                                {samples.map((sample, idx) => (
                                    <SampleInfoCard key={`sample-card-${idx}`} index={idx} data={sample} calibrationCurve={calibrationCurve} map={map} onUpdate={value => onSampleUpdate(idx, value)} />
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </>
    )
}

export default App;