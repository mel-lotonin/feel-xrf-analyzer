import {CalibrationCurve} from "./App.tsx";
import {Group, Rect, Text} from "react-konva";
import Konva from "konva";
import KonvaEventObject = Konva.KonvaEventObject;

export class SampleData {
    private _x: number;
    private _y: number;
    private _width: number;
    private _height: number;
    private _dirty: boolean;
    private _avgCounts: number;

    constructor(x: number, y: number, width: number, height: number, rotation: number = 0) {
        this._x = x;
        this._y = y;
        this._width = width;
        this._height = height;
        this._rotation = rotation;
        this._avgCounts = -1;
        this._dirty = true;
    }

    private _rotation: number;

    get rotation(): number {
        return this._rotation;
    }

    set rotation(value: number) {
        this._dirty = true;
        this._rotation = value;
    }

    get x(): number {
        return this._x;
    }

    set x(value: number) {
        this._dirty = true;
        this._x = value;
    }

    get y(): number {
        return this._y;
    }

    set y(value: number) {
        this._dirty = true;
        this._y = value;
    }

    get width(): number {
        return this._width;
    }

    set width(value: number) {
        this._dirty = true;
        this._width = value;
    }

    get height(): number {
        return this._height;
    }

    set height(value: number) {
        this._dirty = true;
        this._height = value;
    }

    avgCounts(map: number[][]): number {
        if (this._dirty) {
            let mask = this.rectangularMask(map);

            let sum = 0;
            let counts = 0;

            for (let y = 0; y < map.length; y++) {
                for (let x = 0; x < map[0].length; x++) {
                    if (mask[y][x]) {
                        sum += map[y][x];
                        counts += 1;
                    }
                }
            }

            this._avgCounts = counts ? sum / counts : -1;
            this._dirty = false;
        }
        return this._avgCounts;
    }

    rectangularMask(map: number[][]):
        boolean[][] {
        let mapW = map[0].length;
        let mapH = map.length;

        const mask: boolean[][] = Array.from({length: mapH}, () =>
            Array.from({length: mapW}, () => false)
        );

        const theta = (this._rotation * Math.PI) / 180;

        for (let y = 0; y < mapH; y++) {
            for (let x = 0; x < mapW; x++) {

                const dx = x - this._x;
                const dy = y - this._y;

                // Rotate point in opposite direction
                const xr = dx * Math.cos(-theta) - dy * Math.sin(-theta);
                const yr = dx * Math.sin(-theta) + dy * Math.cos(-theta);

                if (0 <= xr && xr <= this._width && 0 <= yr && yr <= this._height) {
                    mask[y][x] = true;
                }
            }
        }

        return mask;
    }
}

interface SampleCardProps {
    index: number,
    data: SampleData,
    map: number[][]
    calibrationCurve?: CalibrationCurve;
    onDelete?: () => void;
    onUpdate?: (updatedData: SampleData) => void;
    onRotate?: (angle: number) => void;
}

function SampleCard({index, data, map, calibrationCurve, onDelete, onRotate}: SampleCardProps) {
    return (<div className="card mb-3">
        <div className="card-body">
            <h6 className="card-title">Sample {index + 1}</h6>
            <span className="card-text">
                <div className="mb-3">
                    <strong>Position</strong>: ({data.x}, {data.y})
                </div>
                <div className="mb-3">
                    <strong>Dimensions:</strong> {data.width}x{data.height}</div>
                <div className="mb-3">
                    <strong>Avg
                        Counts:</strong> {data.avgCounts(map).toFixed(2) ?? "not calculated"}</div>
                <div className="mb-3">
                    <strong>Loading
                        (Est):</strong> {calibrationCurve ? `${(calibrationCurve.slope * data.avgCounts(map) + calibrationCurve.int).toFixed(2)} µg/cm²` : "Not enough data to determine loading"}
                </div>
                <div className="input-group">
                    <span className="input-group-text">Rotation (deg)</span>
                    <input type="number" className="form-control" value={data.rotation} onChange={e =>
                        onRotate?.(parseFloat(e.target.value))}
                    />
                </div>
                <br/>
                <button className="btn btn-danger"
                        onClick={() => onDelete?.()}>Delete
                </button>
            </span>
        </div>
    </div>)
}

interface SampleTempCanvasProps {
    sample: SampleData;
    cellSize: number;
}

export function SampleTempCanvas({sample, cellSize}: SampleTempCanvasProps) {
    return (<Rect
        x={sample.x * cellSize}
        y={sample.y * cellSize}
        width={sample.width * cellSize}
        height={sample.height * cellSize}
        stroke="yellow"
        strokeWidth={2}
    />);
}

interface SampleCanvasProps {
    idx: number;
    sample: SampleData;
    cellSize: number;
    onDragStart: (e: KonvaEventObject<DragEvent>) => void;
    onDragMove: (e: KonvaEventObject<DragEvent>) => void;
    onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}


export function SampleCanvas({idx, sample, cellSize, onDragStart, onDragMove, onDragEnd}: SampleCanvasProps) {
    return (
        <Group>
            <Rect
                x={sample.x * cellSize}
                y={sample.y * cellSize}
                width={sample.width * cellSize}
                height={sample.height * cellSize}
                stroke="green"
                strokeWidth={2}
                draggable
                onDragMove={onDragMove}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                rotation={sample.rotation}
            />
            <Text
                x={sample.x * cellSize + 5}
                y={sample.y * cellSize + 5}
                text={`${idx + 1}`}
                fontSize={14}
                fill="green"/>
        </Group>
    );
}

export default SampleCard;