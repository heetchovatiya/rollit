import {queueTimer} from '@/lib/pos/queue-timer';

export function QueueTimer({date,now,blinkAfterMinutes}:{date:string;now:number;blinkAfterMinutes:number}){
 const timer=queueTimer(date,now,blinkAfterMinutes);
 const description=`Order age ${Math.floor(timer.minutes)} minutes. ${timer.tone}${timer.blinking?', overdue':''}.`;
 return <span className={'queue-age-timer'+(timer.blinking?' is-overdue':'')} role="img" aria-label={description} title={description} style={{color:timer.color}}>
  <svg viewBox="0 0 48 48" aria-hidden="true">
   <circle className="queue-age-track" cx="24" cy="24" r="20"/>
   <circle className="queue-age-progress" cx="24" cy="24" r="20" pathLength="100" strokeDasharray="100" strokeDashoffset={100*(1-timer.remaining)}/>
  </svg>
  <span className="queue-age-value">{timer.label}</span>
 </span>;
}
