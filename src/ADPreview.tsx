import {useEffect, useState} from "react";
import {listen, UnlistenFn} from "@tauri-apps/api/event";
import {getCurrentWindow} from "@tauri-apps/api/window";
import {invoke} from "@tauri-apps/api/core";
import {Image, Layer, Stage} from "react-konva";

interface StageData {
    img: HTMLImageElement;
    data: string;
}


function ADPreview() {
    const [map, setMap] = useState<number[][] | null>(null);
    const [stages, setStages] = useState<Map<string, StageData>>(new Map());


    const width = map?.[0]?.length ?? 0;
    const height = map?.length ?? 0;

    useEffect(() => {
        if (!map) return;


        invoke<Map<string, string>>("analyze_map", {map}).then((result) => {
            setStages(new Map<string, StageData>(Object.entries(result)
                .map(([key, value]) => {
                    let img = new window.Image();
                    img.src = value;

                    return [key, {
                        data: value,
                        img: img
                    }];
                })
            ));
        })
    }, [map]);

    useEffect(() => {
        let mapListener: UnlistenFn;

        listen<number[][]>("feel://analyzeStart", e => {
            setMap(e.payload);
        }).then(x => {
            mapListener = x;
        })

        getCurrentWindow().emit("feel://analyzeReady");

        return () => {
            if (mapListener)
                mapListener();
        };
    }, []);

    return (<div className="container">
        <main role="main" className="pb-3">
            {[...stages.entries()].map(([key, stage]) => (
                <div key={key} className="card mb-3" style={{width: `${width}px`}}>
                    <h1 className="card-title">{key}</h1>
                    <Stage className="card-img" width={width} height={height}>
                        <Layer>
                            <Image image={stage.img} x={0} y={0} width={width} height={height}/>
                        </Layer>
                    </Stage>
                </div>
            ))}
        </main>
    </div>)
}

export default ADPreview;