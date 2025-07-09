import {CalibrationCurve} from "./App.tsx";

export class SampleData {
    private _x: number;
    private _y: number;
    private _width: number;
    private _height: number;
    private _dirty: boolean;
    private _avgCounts: number;

    constructor(x: number, y: number, width: number, height: number) {
        this._x = x;
        this._y = y;
        this._width = width;
        this._height = height;
        this._avgCounts = -1;
        this._dirty = true;
    }

    avgCounts(map: number[][]): number {
        if (this._dirty) {
            let sum = 0;

            for (let y = 0; y < this._height; y++) {
                for (let x = 0; x < this._width; x++) {
                    sum += map[y + Math.floor(this._y)][x + Math.floor(this._x)];
                }
            }
            this._avgCounts = (this._width * this._height > 0) ? sum / (this._width * this._height) : -1;
            this._dirty = false;
        }

        return this._avgCounts;
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
}

interface SampleCardProps
{
    index: number,
    data: SampleData,
    map: number[][]
    calibrationCurve?: CalibrationCurve;
    onDelete?: () => void;
    onUpdate?: (updatedData: SampleData) => void;
}

function SampleCard({index, data, map, calibrationCurve, onDelete}: SampleCardProps)
{
 return (<div className="card mb-3">
     <div className="card-body">
         <h6 className="card-title">Sample {index + 1}</h6>
         <p className="card-text">
             <strong>Position</strong>: ({data.x}, {data.y}) <br/>
             <strong>Dimensions:</strong> {data.width}x{data.height}
             <br/>
             <strong>Avg
                 Counts:</strong> {data.avgCounts(map).toFixed(2) ?? "not calculated"}<br/>
             <strong>Loading
                 (Est):</strong> {calibrationCurve ? `${(calibrationCurve.slope * data.avgCounts(map) + calibrationCurve.int).toFixed(2)} µg/cm²` : "Not enough data to determine loading"}
             <br/>
             <button className="btn btn-danger"
                     onClick={() => onDelete?.()}>Delete
             </button>
         </p>
     </div>
 </div>)
}

export default SampleCard;