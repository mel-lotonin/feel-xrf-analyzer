import {CalibrationCurve} from "./App.tsx";
import {Circle, Group, Rect, Text} from "react-konva";
import Konva from "konva";

export enum SampleType {
    Reference,
    Unknown
}

export enum SampleShape {
    Rect,
    Circle
}

export class Sample {
    private _x: number;
    private _y: number;

    private _w: number | null;

    private _h: number | null;

    private _r: number | null;
    private _a: number;

    private _loading: number | null;
    private _type: SampleType
    private _shape: SampleShape;

    private _recalc: boolean;
    private _counts: number | null;


    constructor(x: number, y: number, w: number | null, h: number | null, r: number | null, loading: number | null, type: SampleType, shape: SampleShape, a: number = 0) {
        this._x = x;
        this._y = y;
        this._w = w;
        this._h = h;
        this._r = r;
        this._loading = loading;
        this._type = type;
        this._shape = shape;
        this._recalc = true;
        this._counts = null;
        this._a = a;
    }

    static createCircle(x: number, y: number, r: number, type: SampleType = SampleType.Unknown, a: number = 0): Sample {
        return new Sample(x, y, null, null, r, null, type, SampleShape.Circle, a)
    }

    static createRect(x: number, y: number, w: number, l: number, type: SampleType = SampleType.Unknown, a: number = 0): Sample {
        return new Sample(x, y, w, l, null, null, type, SampleShape.Rect, a)
    }


    get x(): number {
        return this._x;
    }

    get y(): number {
        return this._y;
    }

    get w(): number | null {
        return this._w;
    }

    get h(): number | null {
        return this._h;
    }

    get r(): number | null {
        return this._r;
    }

    get loading(): number | null {
        return this._loading;
    }

    get type(): SampleType {
        return this._type;
    }

    get shape(): SampleShape {
        return this._shape;
    }


    get a(): number {
        return this._a;
    }

    counts(map: number[][]): number | null {
        if (this._recalc) {
            let sum = 0;
            let counts = 0;
            let mask = this._shape == SampleShape.Rect ?
                rectangularMask([map[0].length, map.length], this._x, this._y, this._w!, this._h!, this._a) :
                circularMask([map[0].length, map.length], this._x, this._y, this._r!);

            for (let y = 0; y < map.length; y++) {
                for (let x = 0; x < map[0].length; x++) {
                    if (mask[y][x]) {
                        sum += map[y][x];
                        counts += 1;
                    }
                }
            }

            console.log("counts", counts);

            this._counts = counts ? sum / counts : null;
            this._recalc = false;
        }

        return this._counts;
    }


    set a(value: number) {
        this._recalc = true;
        this._a = value;
    }

    set x(value: number) {
        this._recalc = true;
        this._x = value;
    }

    set y(value: number) {
        this._recalc = true;
        this._y = value;
    }

    set w(value: number | null) {
        this._recalc = true;
        this._w = value;
    }

    set h(value: number | null) {
        this._recalc = true;
        this._h = value;
    }

    set r(value: number | null) {
        this._recalc = true;
        this._r = value;
    }

    set loading(value: number | null) {
        this._loading = value;
    }

    set type(value: SampleType) {
        this._type = value;
        if (this.type == SampleType.Reference) {
            this.loading = null;
        }
    }

    set shape(value: SampleShape) {
        this._recalc = true;
        this._shape = value;
        switch (this._shape) {
            case SampleShape.Rect:
                this._w = this._r;
                this._h = this._r;
                break;
            case SampleShape.Circle:
                this._r = Math.sqrt((this._w ?? 0) ** 2 + (this._h ?? 0) ** 2)
                break;
        }
    }
}

interface SampleCardProps {
    index: number,
    data: Sample,
    map: number[][]
    calibrationCurve?: CalibrationCurve;
    onDelete?: () => void;
    onUpdate?: (value: Sample) => void;
}

export function SampleInfoCard({index, data, map, calibrationCurve, onDelete, onUpdate}: SampleCardProps) {
    return (<div className="card mb-3">
            <div className="card-body">
                <h6 className="card-title">{data.type === SampleType.Reference ? "Reference" : "Sample"} {index + 1}</h6>
                <span className="card-text">
                <div className="mb-3">
                     <label className="form-label">Position</label>
                    <input type="text" className="form-control"
                           value={`(${data.x}, ${data.y})`} readOnly/>
                </div>
                <div className="mb-3">
                    <label className="form-label">{data.shape === SampleShape.Rect ? "Dimensions" : "Radius"}</label>
                    <input type="text" className="form-control"
                           value={data.shape == SampleShape.Rect ? `${data.w}x${data.h}` : `${data.r}`} readOnly/>
                </div>
                <div className="mb-3">
                    <label className="form-label">Counts</label>
                    <input type="number" className="form-control"
                           value={data.counts(map) !== null ? data.counts(map)! : "failed to compute counts"} readOnly/>
                </div>
                <div className="mb-3">
                     <label className="form-label">Loading (est.)</label>
                    <input type="number" className="form-control"
                           value={(calibrationCurve !== undefined && data.counts(map) !== null) ? `${(calibrationCurve.slope * data.counts(map)! + calibrationCurve.int).toFixed(2)} µg/cm²` : "Not enough data to determine loading"}
                           readOnly/>
                </div>
                <br/>
                    <div className="btn-group-toggle" data-toggle="buttons">
                        <label className="btn btn-secondary active">
                        <input type="checkbox"
                               checked={data.type == SampleType.Reference}
                               onChange={e => onUpdate?.(new Sample(data.x, data.y, data.w, data.h, data.r, data.loading, e.target.checked ? SampleType.Reference : SampleType.Unknown, data.shape, data.a))}
                        />
                            {data.type == SampleType.Reference ? "Make Unknown" : "Make Reference"}
                        </label>
                    </div>
                <button className="btn btn-danger"
                        onClick={() => onDelete?.()}>Delete
                </button>
            </span>
            </div>
        </div>
    )
}

interface SampleCanvasProps {
    index: number,
    data: Sample,
    cellSize: number;
    onUpdate?: (value: Sample) => void;
}

export function SampleCanvas({index, data, cellSize, onUpdate}: SampleCanvasProps) {
    function onDrag(e: Konva.KonvaEventObject<DragEvent>) {
        onUpdate?.(new Sample(Math.floor(e.target.x() / cellSize), Math.floor(e.target.y() / cellSize), data.w, data.h, data.r, data.loading, data.type, data.shape, data.a))
    }

    return (
        <Group>
            {data.shape === SampleShape.Rect && (
                <Group>
                    <Rect
                        x={data.x * cellSize}
                        y={data.y * cellSize}
                        width={data.w! * cellSize}
                        height={data.h! * cellSize}
                        stroke={data.type === SampleType.Reference ? "green" : "red"}
                        rotation={data.a}
                        strokeWidth={2}
                        draggable
                        onDragStart={onDrag}
                        onDragMove={onDrag}
                        onDragEnd={onDrag}
                    />
                    <Text
                        x={data.x * cellSize + 5}
                        y={data.y * cellSize + 5}
                        text={`${index + 1}`}
                        fontSize={14}
                        fill={data.type === SampleType.Reference ? "green" : "red"}/>
                </Group>
            )}
            {data.shape === SampleShape.Circle && (
                <Group>
                    <Circle
                        x={data.x * cellSize}
                        y={data.y * cellSize}
                        radius={data.r! * cellSize}
                        width={data.r! * 2 * cellSize}
                        height={data.r! * 2 * cellSize}
                        stroke={data.type === SampleType.Reference ? "green" : "red"}
                        strokeWidth={2}
                        draggable
                        onDragStart={onDrag}
                        onDragMove={onDrag}
                        onDragEnd={onDrag}
                    />
                    <Text
                        x={(data.x - data.r!) * cellSize + 5}
                        y={(data.y - data.r!) * cellSize + 5}
                        text={`${index + 1}`}
                        fontSize={14}
                        fill={data.type === SampleType.Reference ? "green" : "red"}/>
                </Group>
            )}
        </Group>

    );
}

function circularMask(dims: [number, number], x: number, y: number, r: number): boolean[][] {
    const [width, height] = dims;
    return Array.from({length: height}, (_, y2) =>
        Array.from({length: width}, (_, x2) => (x - x2) ** 2 + (y - y2) ** 2 <= r ** 2)
    );
}

function rectangularMask(dims: [number, number], x: number, y: number, w: number, h: number, a: number): boolean[][] {
    let [mapW, mapH] = dims;

    const mask: boolean[][] = Array.from({length: mapH}, () =>
        Array.from({length: mapW}, () => false)
    );

    const theta = (a * Math.PI) / 180;

    for (let i = 0; i < mapH; i++) {
        for (let j = 0; j < mapW; j++) {

            const dx = j - x;
            const dy = i - y;

            // Rotate point in opposite direction
            const xr = dx * Math.cos(-theta) - dy * Math.sin(-theta);
            const yr = dx * Math.sin(-theta) + dy * Math.cos(-theta);

            if (0 <= xr && xr <= w && 0 <= yr && yr <= h) {
                mask[i][j] = true;
            }
        }
    }

    return mask;
}