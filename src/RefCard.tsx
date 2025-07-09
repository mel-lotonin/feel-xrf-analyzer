import {CalibrationCurve} from './App.tsx'
import {Circle, Group, Text} from "react-konva";
import Konva from "konva";
import KonvaEventObject = Konva.KonvaEventObject;

export class RefData {
    private _x: number;
    private _y: number;
    private _r: number;
    private _loading?: number;
    private _avgCounts?: number;
    private _dirty: boolean;


    constructor(x: number, y: number, r: number) {
        this._x = x;
        this._y = y;
        this._r = r;
        this._dirty = true;
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

    get r(): number {
        return this._r;
    }

    set r(value: number) {
        this._dirty = true;
        this._r = value;
    }

    get loading(): number | undefined {
        return this._loading;
    }

    set loading(value: number) {
        this._dirty = true;
        this._loading = value;
    }

    avgCounts(map: number[][]): number {
        if(!this._loading)
            return -1;

        if(this._dirty) {
            const mask = circularMask([map[0].length, map.length], this._x, this._y, this._r);
            let sum = 0;
            let count = 0;

            for (let y = 0; y < map.length; y++) {
                for (let x = 0; x < map[0].length; x++) {
                    if (mask[y][x]) {
                        sum += map[y][x];
                        count++;
                    }
                }
            }

            this._avgCounts = count > 0 ? (sum / count) : -1;
            this._dirty = false;
        }

        return this._avgCounts!;
    }
}

interface RefCardProps {
    index: number;
    data: RefData;
    map: number[][];
    calibrationCurve?: CalibrationCurve;
    onDelete?: () => void;
    onUpdate?: (updatedData: RefData) => void;
}

function RefCard({index, data, map, calibrationCurve, onDelete}: RefCardProps) {
    return (
        <div className="card mb-3">
            <div className="card-body">
                <h6 className="card-title">Reference {index + 1}</h6>
                <span className="card-text">
                    <strong>Position</strong>: ({data.x}, {data.y}) <br/>
                    <strong>Radius:</strong> {data.r.toFixed(2)} <br/>
                    <strong>Loading:</strong> {data.loading!} µg/cm²
                    <br/>
                    <strong>Avg
                        Counts:</strong> {data.avgCounts(map).toFixed(2) ?? "not calculated"}
                    <br/>
                    <strong>Estimated
                        Loading:</strong> {calibrationCurve ? `${(calibrationCurve.slope * data.avgCounts(map) + calibrationCurve.int).toFixed(2)} µg/cm²` : "Not enough data to determine loading"}
                    <br/>
                    <button className="btn btn-danger"
                            onClick={() => onDelete?.()}>Delete
                    </button>
                </span>
            </div>
        </div>)
}

interface RefTempCanvasProps {
    data: RefData;
    cellSize: number;
}

export function RefTempCanvas({data, cellSize}: RefTempCanvasProps) {
    return (<Circle x={data.x * cellSize} y={data.y * cellSize}
                    radius={data.r * cellSize}
                    stroke="yellow"
                    strokeWidth={2}/>);
}

interface RefCanvasProps {
    idx: number;
    data: RefData;
    cellSize: number;
    onDragStart: (e: KonvaEventObject<DragEvent>) => void;
    onDragMove: (e: KonvaEventObject<DragEvent>) => void;
    onDragEnd: (e: KonvaEventObject<DragEvent>) => void;
}


export function RefCanvas({idx, data, cellSize, onDragStart, onDragMove, onDragEnd}: RefCanvasProps) {
    return (
        <Group>
            <Circle
                x={data.x * cellSize}
                y={data.y * cellSize}
                radius={data.r * cellSize}
                stroke="red"
                strokeWidth={2}
                draggable
                onDragMove={onDragMove}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
            />
            <Text
                x={data.x * cellSize - data.r - 3}
                y={data.y * cellSize - data.r - 3}
                text={`${idx + 1}`}
                fontSize={14}
                fill="red"/>
        </Group>
    );
}

function circularMask(dims: [number, number], x: number, y: number, r: number): boolean[][] {
    const [width, height] = dims;
    return Array.from({length: height}, (_, y2) =>
        Array.from({length: width}, (_, x2) => (x - x2) ** 2 + (y - y2) ** 2 <= r ** 2)
    );
}

export default RefCard;