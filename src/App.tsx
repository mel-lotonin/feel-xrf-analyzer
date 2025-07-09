import {useEffect, useRef, useState} from "react";
import {invoke} from "@tauri-apps/api/core";
import {open} from "@tauri-apps/plugin-dialog";
import "./App.css";

import {Circle, Image as KImage, Layer, Rect, Stage, Text, Group} from "react-konva";
import './ColorMaps.tsx'
import {Color, MasoudMap} from "./ColorMaps.tsx";
import Konva from "konva";
import RefCard, {RefData} from "./RefCard.tsx";
import SampleCard, {SampleData} from "./SampleCard.tsx";


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

    const [drawMode, setDrawMode] = useState<DrawMode>(DrawMode.None);

    const [refsData, setRefsData] = useState<RefData[]>([]);
    const [tempRef, setTempRef] = useState<RefData | null>(null);

    const [samplesData, setSamplesData] = useState<SampleData[]>([]);
    const [tempSample, setTempSample] = useState<SampleData | null>(null);

    const calibrationCurve = calculateRegression(refsData.filter(r => r.loading).map(r => ({
        x: r.avgCounts(map!),
        y: r.loading!
    })));

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
        setRefsData([])
        setSamplesData([])
    }, [map]);

    const onMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
        const pos = e.target.getStage()?.getPointerPosition();
        if (!pos) return;

        if (drawMode === DrawMode.Reference) {
            setTempRef(new RefData(
                Math.floor(pos.x / cellSize),
                Math.floor(pos.y / cellSize),
                1
            ));
        } else if (drawMode === DrawMode.Sample) {
            setTempSample(new SampleData(
                Math.floor(pos.x / cellSize),
                Math.floor(pos.y / cellSize),
                1,
                1,
            ));
        }
    };

    const onMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
        if (drawMode === DrawMode.None) return;

        const pos = e.target.getStage()?.getPointerPosition();
        if (!pos) return;

        if (drawMode === DrawMode.Reference && tempRef) {
            const dx = pos.x - tempRef.x * cellSize;
            const dy = pos.y - tempRef.y * cellSize;
            const radius = Math.sqrt(dx * dx + dy * dy);

            setTempRef(prev => (new RefData(prev!.x, prev!.y, Math.floor(radius / cellSize))));
        } else if (drawMode === DrawMode.Sample && tempSample) {
            const dx = pos.x - tempSample.x * cellSize;
            const dy = pos.y - tempSample.y * cellSize;

            setTempSample(prev => (new SampleData(prev!.x, prev!.y, Math.floor(dx / cellSize), Math.floor(dy / cellSize))));
        }
    };

    const onMouseUp = () => {
        if (drawMode === DrawMode.Reference && tempRef) {
            setTempRef(prev => {
                const copy = prev!;
                copy.loading = -1;
                return copy
            });
            setDrawMode(DrawMode.None);
        } else if (drawMode === DrawMode.Sample && tempSample) {
            let x = tempSample.x;
            let y = tempSample.y;
            let width = tempSample.width;
            let height = tempSample.height;

            if (width < 0) {
                x += width;
                width = Math.abs(width);
            }

            if (height < 0) {
                y += height;
                height = Math.abs(height);
            }

            setSamplesData((prev => ([...prev, new SampleData(
                x, y, width, height
            )])));
            setTempSample(null)
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

    function setLoading(value: number) {
        setRefsData(prev => {
            const copy = tempRef!;
            copy.loading = value;

            return [...prev, copy]
        });
        setTempRef(null);
    }

    function onRefDragEnd(e: Konva.KonvaEventObject<DragEvent>, idx: number) {
        setRefsData(prev => {
            const copy = [...prev]
            copy[idx].x = Math.floor(e.target.x() / cellSize);
            copy[idx].y = Math.floor(e.target.y() / cellSize);
            return copy;
        });
    }

    function onRefDragStart(e: Konva.KonvaEventObject<DragEvent>, idx: number) {
        setRefsData(prev => {
            const copy = [...prev]
            copy[idx].x = Math.floor(e.target.x() / cellSize);
            copy[idx].y = Math.floor(e.target.y() / cellSize);
            return copy;
        });
    }

    function onRefDragMove(e: Konva.KonvaEventObject<DragEvent>, idx: number) {
        setRefsData(prev => {
            const copy = [...prev]
            copy[idx].x = Math.floor(e.target.x() / cellSize);
            copy[idx].y = Math.floor(e.target.y() / cellSize);

            return copy;
        });
    }

    function onSampleDragMove(e: Konva.KonvaEventObject<DragEvent>, idx: number) {
        setSamplesData(prev => {
            const copy = [...prev]
            copy[idx].x = Math.floor(e.target.x() / cellSize);
            copy[idx].y = Math.floor(e.target.y() / cellSize);

            return copy;
        });
    }

    function onSampleDragStart(e: Konva.KonvaEventObject<DragEvent>, idx: number) {
        setSamplesData(prev => {
            const copy = [...prev]
            copy[idx].x = Math.floor(e.target.x() / cellSize);
            copy[idx].y = Math.floor(e.target.y() / cellSize);

            return copy;
        });
    }

    function onSampleDragEnd(e: Konva.KonvaEventObject<DragEvent>, idx: number) {
        setSamplesData(prev => {
            const copy = [...prev]
            copy[idx].x = Math.floor(e.target.x() / cellSize);
            copy[idx].y = Math.floor(e.target.y() / cellSize);

            return copy;
        });
    }

    function deleteRef(idx: number) {
        const copy = [...refsData]
        copy.splice(idx, 1)
        setRefsData(copy)
    }

    function deleteSample(idx: number) {
        const copy = [...samplesData]
        copy.splice(idx, 1)
        setSamplesData(copy)
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
                                            {tempSample && <Rect
                                                x={tempSample.x * cellSize}
                                                y={tempSample.y * cellSize}
                                                width={tempSample.width * cellSize}
                                                height={tempSample.height * cellSize}
                                                stroke="yellow"
                                                strokeWidth={2}
                                            />}
                                            {samplesData.map((sample, idx) =><Group key={`sample-group-${idx}`}>
                                                    <Rect
                                                        key={`sample-${idx}`}
                                                        x={sample.x * cellSize}
                                                        y={sample.y * cellSize}
                                                        width={sample.width * cellSize}
                                                        height={sample.height * cellSize}
                                                        stroke="green"
                                                        strokeWidth={2}
                                                        draggable
                                                        onDragMove={e => onSampleDragMove(e, idx)}
                                                        onDragStart={e => onSampleDragStart(e, idx)}
                                                        onDragEnd={e => onSampleDragEnd(e, idx)}
                                                    />
                                                    <Text
                                                        key={`circle-idx-${idx}`}
                                                        x={sample.x * cellSize + 5}
                                                        y={sample.y * cellSize + 5}
                                                        text={`${idx + 1}`}
                                                        fontSize={14}
                                                        fill="green"/>
                                                </Group>
                                            )}
                                            {refsData.map((circle, idx) => <Group key={`ref-group-${idx}`}>
                                                    <Circle
                                                        key={`reference-${idx}`}
                                                        x={circle.x * cellSize}
                                                        y={circle.y * cellSize}
                                                        radius={circle.r * cellSize}
                                                        stroke="red"
                                                        strokeWidth={2}
                                                        draggable
                                                        onDragMove={e => onRefDragMove(e, idx)}
                                                        onDragStart={e => onRefDragStart(e, idx)}
                                                        onDragEnd={e => onRefDragEnd(e, idx)}
                                                    />
                                                    {circle.loading !== null && (
                                                        <>
                                                            <Text
                                                                key={`circle-idx-${idx}`}
                                                                x={circle.x * cellSize - circle.r - 3}
                                                                y={circle.y * cellSize - circle.r - 3}
                                                                text={`${idx + 1}`}
                                                                fontSize={14}
                                                                fill="red"/>
                                                        </>
                                                    )}
                                                </Group>
                                            )}
                                            {tempRef &&
                                                <Circle x={tempRef.x * cellSize} y={tempRef.y * cellSize}
                                                        radius={tempRef.r * cellSize}
                                                        stroke="yellow"
                                                        strokeWidth={2}/>}
                                        </Layer>
                                    </Stage>
                                    <div className="card-body">
                                        <h5 className="card-title">Map Details</h5>
                                        <p className="card-text">
                                            Dimensions: {map[0].length}x{map.length}
                                            <br/>
                                            <strong>Slope:</strong> {calibrationCurve?.slope ?? ">=2 references needed"}
                                            <br/>
                                            <strong>Y-intercept:</strong> {calibrationCurve?.int ?? '>=2 references needed'}
                                            <br/>
                                            <strong>r:</strong> {calibrationCurve?.r ?? ">=2 references needed"}
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
                                {refsData.map((refData, idx) => (
                                    <RefCard key={`refcard-${idx}`} index={idx} data={refData}
                                             calibrationCurve={calibrationCurve} map={map}
                                             onDelete={() => deleteRef(idx)}></RefCard>
                                ))}
                                {samplesData.map((sample, idx) => (
                                        <SampleCard key={`samplecard-${idx}`} index={idx} data={sample}
                                                    calibrationCurve={calibrationCurve} map={map}
                                                    onDelete={() => deleteSample(idx)}/>
                                    )
                                )}
                            </div>
                        )}
                    </div>
                </main>
            </div>
            {tempRef?.loading === -1 &&
                <LoadingDialog onSubmit={value => setLoading(value)} onCancel={() => setTempRef(null)}/>}
        </>
    )

}

enum DrawMode {
    None,
    Reference,
    Sample
}


function LoadingDialog({
                           onSubmit,
                           onCancel
                       }: {
    onSubmit: (value: number) => void;
    onCancel: () => void
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
                        <button className="btn btn-secondary" onClick={() => onCancel()}>Cancel</button>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default App;
