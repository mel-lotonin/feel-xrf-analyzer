import {useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import "./App.css";

import {Circle, Image as KImage, Layer, Rect, Stage, Text} from "react-konva";
import './ColorMaps.tsx'
import {Color, CoolMap} from "./ColorMaps.tsx";
import Konva from "konva";

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

function calculateRegression(points: { x: number, y: number }[]): CalibrationData | null {
    const n = points.length;
    if (n < 2) return null;

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

    const [drawMode, setDrawMode] = useState<DrawMode>(DrawMode.None);


    const [refsData, setRefsData] = useState<ReferenceData[]>([]);
    const [tempRef, setTempRef] = useState<ReferenceData | null>(null);
    const prevRefCoords = useRef<{ x: number; y: number }[]>(refsData.map(({x, y}) => ({x, y})));


    const [samplesData, setSamplesData] = useState<SampleData[]>([]);
    const [tempSample, setTempSample] = useState<SampleData | null>(null);
    const prevSampleCoords = useRef<{ x: number; y: number }[]>(samplesData.map(({x, y}) => ({x, y})));

    const calibrationCurve = calculateRegression(refsData.filter(r => r.avgCounts && r.loading).map(r => ({
        x: r.avgCounts!,
        y: r.loading!
    })));

    const width = map ? map[0].length : 0;
    const height = map ? map.length : 0;

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
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
            console.error("Failed to initialize canvas context");
            return
        }

        const imageData = ctx.createImageData(width, height);
        let maxValue = -Infinity;
        let minValue = Infinity;

        for (const row of map) {
            for (const value of row) {
                if (value > maxValue) maxValue = value;
                if (value < minValue) minValue = value;
            }
        }

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const val = map[y][x];
                const ratio = (val - minValue) / (maxValue - minValue);
                const index = (y * width + x) * 4;

                const color = gradientLerp(CoolMap, ratio)

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
        if (!map) return;

        const sampleUpdates = new Map<number, number>();
        const refUpdates = new Map<number, number>();

        samplesData.forEach((sample, idx) => {
            const prev = prevSampleCoords.current[idx];
            if (sample.x !== prev.x || sample.y !== prev.y) {
                let sum = 0;

                for (let y = 0; y < sample.height; y++) {
                    for (let x = 0; x < sample.width; x++) {
                        sum += map[y + Math.round(sample.y)][x + Math.round(sample.x)];
                    }
                }

                const countAvg = sum / (sample.width * sample.height);
                sampleUpdates.set(idx, countAvg);
            }
        });

        refsData.forEach((circle, idx) => {
            const prev = prevRefCoords.current[idx];


            if (circle.x !== prev.x || circle.y !== prev.y) {
                const mask = circularMask([width, height], circle.x, circle.y, circle.r);
                let sum = 0;
                let count = 0;

                for (let y = 0; y < height; y++) {
                    for (let x = 0; x < width; x++) {
                        if (mask[y][x]) {
                            sum += map[y][x];
                            count++;
                        }
                    }
                }

                const countAvg = count > 0 ? (sum / count) : -1;
                refUpdates.set(idx, countAvg);
            }
        });

        if (sampleUpdates.size !== 0) {
            const copy = [...samplesData];

            sampleUpdates.forEach((counts, idx) => {
                if (copy[idx].avgCounts !== counts) {
                    copy[idx].avgCounts = counts;
                }
            });

            setSamplesData(copy);
        }

        if (refUpdates.size !== 0) {
            const copy = [...refsData];

            refUpdates.forEach((counts, idx) => {
                if (copy[idx].avgCounts !== counts) {
                    copy[idx].avgCounts = counts;
                }
            });

            setRefsData(copy);
        }

    }, [refsData, samplesData]);

    useEffect(() => {
        setRefsData([])
        setSamplesData([])
    }, [map]);

    const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const pos = e.target.getStage()?.getPointerPosition();
        if (!pos) return;

        if (drawMode === DrawMode.Reference) {
            setTempRef({
                avgCounts: null,
                loading: null,
                x: pos.x,
                y: pos.y,
                r: 1
            });
        } else if (drawMode === DrawMode.Sample) {
            setTempSample({
                x: pos.x,
                y: pos.y,
                width: 1,
                height: 1,
                avgCounts: null
            });
        }
    };

    const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (drawMode === DrawMode.None) return;

        const pos = e.target.getStage()?.getPointerPosition();
        if (!pos) return;

        if (drawMode === DrawMode.Reference && tempRef) {
            const dx = pos.x - tempRef.x;
            const dy = pos.y - tempRef.y;
            const radius = Math.sqrt(dx * dx + dy * dy);

            setTempRef({
                avgCounts: null,
                loading: null,
                x: tempRef.x,
                y: tempRef.y,
                r: radius
            });
        } else if (drawMode === DrawMode.Sample && tempSample) {
            const dx = pos.x - tempSample.x;
            const dy = pos.y - tempSample.y;

            setTempSample(prev => ({
                ...prev!,
                width: dx,
                height: dy
            }));
        }
    };

    const onMouseUp = () => {
        if (drawMode === DrawMode.Reference && tempRef) {
            prevRefCoords.current = [...refsData, {x: -1, y: -1}].map(({x, y}) => ({x, y}));
            setRefsData([...refsData, tempRef]);

            setTempRef(null);
            setDrawMode(DrawMode.None);
        } else if (drawMode === DrawMode.Sample && tempSample) {
            prevSampleCoords.current = [...samplesData, {x: -1, y: -1}].map(({x, y}) => ({x, y}));
            setSamplesData([...samplesData, tempSample]);
            setTempSample(null);
            setDrawMode(DrawMode.None);
        }
    };


    function onDrawRefClicked() {
        if (drawMode === DrawMode.Reference) {
            setDrawMode(DrawMode.None);
        } else {
            setDrawMode(DrawMode.Reference);
        }
    }

    function onDrawSampleClicked() {
        if (drawMode === DrawMode.Sample) {
            setDrawMode(DrawMode.None);
        } else {
            setDrawMode(DrawMode.Sample);
        }
    }

    function onRefDrag(e: Konva.KonvaEventObject<DragEvent>, idx: number) {
        setRefsData(prev => {
            const copy = [...prev]
            copy[idx] = {
                ...copy[idx],
                x: e.target.x(),
                y: e.target.y()
            }
            return copy;
        })
    }

    function setLoading(value: number, idx: number) {
        setRefsData(prev => {
            const copy = [...prev]
            copy[idx] = {
                ...copy[idx],
                loading: value,
            }
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
                                <div className="card" style={{width: width + 'px'}}>
                                    <Stage className="card-img" width={width} height={height} onMouseUp={onMouseUp}
                                           onMouseMove={onMouseMove} onMouseDown={onMouseDown}>
                                        <Layer>
                                            {img && <KImage image={img}/>}
                                            {tempSample && <Rect
                                                x={tempSample.x}
                                                y={tempSample.y}
                                                width={tempSample.width}
                                                height={tempSample.height}
                                                stroke="yellow"
                                                strokeWidth={2}
                                            />}
                                            {samplesData.map((sample, idx) => <div key={`sample-idx-${idx}`}>
                                                    <Rect
                                                        key={`sample-${idx}`}
                                                        x={sample.x}
                                                        y={sample.y}
                                                        width={sample.width}
                                                        height={sample.height}
                                                        stroke="green"
                                                        strokeWidth={2}
                                                    />
                                                    <Text
                                                        key={`circle-idx-${idx}`}
                                                        x={sample.x + 5}
                                                        y={sample.y + 5}
                                                        text={`${idx + 1}`}
                                                        fontSize={14}
                                                        fill="green"/>
                                                </div>
                                            )}
                                            {refsData.map((circle, idx) => <div key={idx}>
                                                    <Circle
                                                        key={`reference-${idx}`}
                                                        x={circle.x}
                                                        y={circle.y}
                                                        radius={circle.r}
                                                        stroke="red"
                                                        strokeWidth={2}
                                                        draggable
                                                        onDragEnd={e => onRefDrag(e, idx)}/>
                                                    {circle.loading !== null && (
                                                        <>
                                                            <Text
                                                                key={`circle-idx-${idx}`}
                                                                x={circle.x - circle.r - 3}
                                                                y={circle.y - circle.r - 3}
                                                                text={`${idx + 1}`}
                                                                fontSize={14}
                                                                fill="red"/>
                                                        </>
                                                    )}
                                                </div>
                                            )}
                                            {tempRef &&
                                                <Circle x={tempRef.x} y={tempRef.y} radius={tempRef.r}
                                                        stroke="yellow"
                                                        strokeWidth={2}/>}
                                        </Layer>
                                    </Stage>
                                    <div className="card-body">
                                        <h5 className="card-title">Map Details</h5>
                                        <p className="card-text">
                                            Dimensions: {map[0].length}x{map.length}
                                            <br/>
                                            Calibration
                                            Curve: {JSON.stringify(calibrationCurve)}
                                        </p>
                                        <div className="input-group">
                                            <button
                                                className={"btn btn" + (drawMode === DrawMode.Reference ? "-outline" : "") + "-primary"}
                                                onClick={onDrawRefClicked}>Add Reference
                                            </button>
                                            <button
                                                className={"btn btn" + (drawMode === DrawMode.Sample ? "-outline" : "") + "-success"}
                                                onClick={onDrawSampleClicked}>Add Sample
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            <br/>
                            <button className="btn btn-outline-primary" onClick={handleLoadMap}>Load Map</button>
                        </div>
                        {map && (
                            <div className="col">
                                {refsData.map((refData, refIdx) => (
                                    <div className="card mb-3" key={`ref-data-${refIdx}`}>
                                        <div className="card-body">
                                            <h6 className="card-title">Reference {refIdx + 1}</h6>
                                            <p className="card-text">
                                                <strong>Position</strong>: ({refData.x}, {refData.y}) <br/>
                                                <strong>Radius:</strong> {refData.r.toFixed(2)} <br/>
                                                <strong>Loading:</strong> {refData.loading ? `${refData.loading} µg/cm²` : "No loading defined"}
                                                <br/>
                                                <strong>Avg
                                                    Counts:</strong> {refData.avgCounts?.toFixed(2) ?? "not calculated"}
                                                <br/>
                                                <strong>Estimated
                                                    Loading:</strong> {(calibrationCurve && refData.avgCounts) ? `${(calibrationCurve.slope * refData.avgCounts + calibrationCurve.int).toFixed(2)} µg/cm²` : "Not enough data to determine loading"}
                                            </p>
                                        </div>
                                    </div>
                                ))}
                                {samplesData.map((sample, idx) => (
                                        <div className="card mb-3" key={`sample-data-${idx}`}>
                                            <div className="card-body">
                                                <h6 className="card-title">Sample {idx + 1}</h6>
                                                <p className="card-text">
                                                    <strong>Position</strong>: ({sample.x}, {sample.y}) <br/>
                                                    <strong>Dimensions:</strong> {sample.width}x{sample.height}
                                                    <br/>
                                                    <strong>Avg
                                                        Counts:</strong> {sample.avgCounts?.toFixed(2) ?? "not calculated"}<br/>
                                                    <strong>Loading
                                                        (Est):</strong> {(calibrationCurve && sample.avgCounts) ? `${(calibrationCurve.slope * sample.avgCounts + calibrationCurve.int).toFixed(2)} µg/cm²` : "Not enough data to determine loading"}
                                                </p>
                                            </div>
                                        </div>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>
            {
                refsData.map((ref, idx) => {
                        if (ref.loading === null) {
                            return <LoadingDialog key={`loading-model-${idx}`} onSubmit={value => setLoading(value, idx)}/>
                        }
                    }
                )
            }
        </>
    )

}

interface ReferenceData {
    x: number;
    y: number;
    r: number;
    loading: number | null;
    avgCounts: number | null;
}

interface SampleData {
    x: number;
    y: number;
    width: number;
    height: number;
    avgCounts: number | null;
}

interface CalibrationData {
    slope: number,
    int: number,
    r: number
}

enum DrawMode {
    None,
    Reference,
    Sample
}

function circularMask(dims: [number, number], x: number, y: number, r: number): boolean[][] {
    const [width, height] = dims;
    return Array.from({length: height}, (_, y2) =>
        Array.from({length: width}, (_, x2) => (x - x2) ** 2 + (y - y2) ** 2 <= r ** 2)
    );
}


function LoadingDialog({
                           onSubmit
                       }: {
    onSubmit: (value: number) => void;
}) {
    const [value, setValue] = useState('');

    return (
        <div className="modal show d-block" tabIndex={-1} style={{backgroundColor: 'rgba(0,0,0,0.5)'}}>
            <div className="modal-dialog">
                <div className="modal-content">
                    <div className="modal-header">
                        <h5 className="modal-title">Enter Loading (µg/cm²)</h5>
                    </div>
                    <div className="modal-body">
                        <input
                            type="number"
                            className="form-control"
                            placeholder="ex. 120"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                        />
                    </div>
                    <div className="modal-footer">
                        <button
                            className="btn btn-primary"
                            onClick={() => {
                                const num = parseFloat(value);
                                if (!isNaN(num)) onSubmit(num);
                            }}
                        >
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
