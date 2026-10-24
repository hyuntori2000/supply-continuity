/** Require a complete identifier token; a prefix of a different lot is not evidence. */
export function hasExactIdentifier(text:string,identifier:string){
 const tokens:string[]=text.toUpperCase().match(/[A-Z0-9_-]+/g)||[];
 return tokens.includes(identifier.toUpperCase());
}
