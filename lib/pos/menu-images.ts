/** Cell coordinates in our original nine-item illustration atlas. */
export function menuArtCell(name:string){
 const n=name.toLowerCase();
 if(/water/.test(n))return /big|large|1\s*l/.test(n)?[2,2]:[1,2];
 if(/fries|french fry/.test(n)){if(/loaded/.test(n))return [0,2];if(/chees/.test(n))return [2,1];if(/peri/.test(n))return [1,1];return [0,1];}
 if(/paneer/.test(n))return [1,0];if(/mushroom/.test(n))return [2,0];return [0,0];
}
export function menuArtPosition(name:string){const [x,y]=menuArtCell(name);return `${x*50}% ${y*50}%`;}
