export function queueTimer(date:string,now:number,blinkAfterMinutes:number){
 const started=Date.parse(date);
 const elapsed=Math.max(0,Number.isFinite(started)?now-started:0);
 const minutes=elapsed/60000;
 const remaining=Math.max(0,1-minutes/30);
 const tone=minutes<10?'green':minutes<20?'yellow':'red';
 const seconds=Math.floor(elapsed/1000);
 const label=minutes<60?`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`:`${Math.floor(minutes/60)}h`;
 return {minutes,remaining,tone,label,color:`hsl(${Math.round(120*remaining)} 76% 37%)`,blinking:minutes>=blinkAfterMinutes};
}
