import { defaults, type Concept, type Profile } from "./engine";

type Rule = [string, string];
type Problem = [prompt: string, answer: string | number, errors?: Record<string, string | number>];
type Template = (a: number, b: number, n: number, x: number, exam: boolean, level: import("./engine").Level) => Problem;
type Definition = [id: string, name: string, type: Concept["type"], prerequisites: string[], difficulty: number, instruction: string, template: Template, rules?: Rule[]];
const powerRules: Rule[] = [
  ["no_multiplier", "Reduce the exponent and leave the coefficient unchanged."],
  ["same_exponent", "Multiply by the original exponent and leave the exponent unchanged."],
  ["identity", "Return the original function as its derivative."],
  ["integration", "Increase the exponent and divide by the new exponent."],
];
const poly = (a: number, n: number) => n === 0 ? String(a) : `${a}x${n === 1 ? "" : `^${n}`}`;
const powerErrors = (a: number, n: number) => ({
  no_multiplier: poly(a, n - 1), same_exponent: poly(a * n, n), identity: poly(a, n), integration: poly(a / (n + 1), n + 1),
});
const definitions: Definition[] = [
  ["algebra", "Basic algebra", "procedural", [], .1, "Isolate the variable by applying inverse operations to both sides.",
    (a,b,_n,x) => [`Solve ${a}x + ${b} = ${a*x+b}.`, x]],
  ["exponents", "Exponents", "factual", [], .1, "When multiplying powers of the same base, add their exponents.",
    (a,b) => [`What is the exponent of x in x^${a} × x^${b}?`, a+b]],
  ["functions", "Functions", "conceptual", ["algebra"], .13, "Evaluate f(x) by substituting the input for x.",
    (a,b,_n,x) => [`If f(x) = ${a}x + ${b}, find f(${x}).`, a*x+b]],
  ["graphs", "Graph interpretation", "conceptual", ["functions"], .12, "The second coordinate of (x, y) is the graph height at x.",
    (a,b) => [`A graph passes through (${a}, ${b}). What is its height at x = ${a}?`, b]],
  ["slope", "Straight-line slope", "procedural", ["algebra","graphs"], .18, "Divide the vertical change by the horizontal change.",
    (a,b,_n,x) => [`Find the slope through (0, ${b}) and (${x}, ${a*x+b}).`, a]],
  ["limits", "Limits", "conceptual", ["functions","exponents"], .22, "A limit describes nearby behavior. For a polynomial, evaluate the limit by substitution.",
    (a,b,_n,x) => [`Find the limit of ${a}x² + ${b} as x approaches ${x}.`, a*x*x+b]],
  ["average", "Average rate of change", "procedural", ["slope","functions"], .22, "Compute the secant gradient (f(v) − f(u))/(v − u).",
    (a,b,_n,x,_exam,level) => level === "near"
      ? [`A sensor records ${a}t² + ${b} units at time t. How many units per second did its reading change on average between t = ${x} and t = ${x+2}?`, a*(2*x+2)]
      : [`Find the average rate of change of ${a}x² + ${b} from ${x} to ${x+1}.`, a*(2*x+1)]],
  ["instantaneous", "Instantaneous rate of change", "conceptual", ["limits","average"], .26, "Shrink the secant interval toward zero to obtain the instantaneous rate.",
    (a,b,_n,x) => [`The secant gradient is ${a} + ${b}h. What is the instantaneous rate as h approaches zero from ${x}?`, a, {average_as_instant: a+b*x}],
    [["average_as_instant","Use the finite secant gradient in place of the limit."]]],
  ["definition", "Derivative definition", "conceptual", ["instantaneous","limits"], .27, "Take the limit of (f(x+h) − f(x))/h as h approaches zero.",
    (a,b,_n,x) => [`After simplifying the difference quotient you obtain ${a}x + ${b}h. Evaluate the derivative at x = ${x}.`, a*x]],
  ["constant", "Constant rule", "factual", ["functions"], .14, "A constant function never changes, so its derivative is zero.",
    (a,b) => [`Differentiate the constant function f(x) = ${a+b}.`, 0, {constant_identity:a+b}],
    [["constant_identity","Keep the constant when taking the derivative."]]],
  ["power", "Power rule", "procedural", ["exponents","definition"], .24, "Multiply by the exponent and subtract one from the exponent.",
    (a,_b,n) => [`Differentiate ${poly(a,n)}.`, poly(a*n,n-1), powerErrors(a,n)], powerRules],
  ["sum", "Sum rule", "conceptual", ["power","constant"], .21, "Differentiate each term and add the results.",
    (a,b,n) => [`Differentiate ${poly(a,n)} + ${b}.`, poly(a*n,n-1), {keep_constant: `${poly(a*n,n-1)} + ${b}`}],
    [["keep_constant","Differentiate the variable term and keep the constant."]]],
  ["polynomial", "Polynomial differentiation", "procedural", ["sum","power"], .28, "Apply the sum and power rules term by term. All constant terms drop out.",
    (a,b,n) => [`Differentiate ${poly(a,n)} + ${poly(b,n+1)}.`, `${poly(a*n,n-1)} + ${poly(b*(n+1),n)}`]],
  ["tangent", "Tangent gradients", "procedural", ["power","slope"], .27, "Evaluate the derivative at the point of tangency.",
    (a,b,_n,x,_exam,level) => level === "near"
      ? [`A road rises ${a}x² + ${b} metres after x horizontal metres. What is its local rise per 10 horizontal metres at x = ${x}?`,20*a*x]
      : [`Find the tangent gradient of y = ${a}x² + ${b} at x = ${x}.`, 2*a*x]],
  ["applications", "Derivative applications", "conceptual", ["tangent","polynomial"], .3, "Differentiate a quantity with respect to time to find its instantaneous rate.",
    (a,b,_n,x,exam,level) => level === "far"
      ? [`A pump fills a tank to ${a}t² + ${b} litres in t minutes. A second pump adds ${b} litres per minute. What is the combined instantaneous fill rate at t = ${x}?`, 2*a*x+b]
      : [`A ${exam ? "reservoir holds" : "cart travels"} ${a}t² + ${b} ${exam ? "litres" : "metres"}. Find its instantaneous rate of change at t = ${x}.`, 2*a*x]],
];
export const calculus: Concept[] = definitions.map(([id,name,type,prerequisites,difficulty,instruction,template,rules = []], index) => {
  const generate = (exam: boolean): Concept["practice"] => (rng, level) => {
    const integer = (min: number, count: number) => min + Math.floor(rng()*count);
    const a = integer(exam ? 12 : 2, 8);
    const b = integer(exam ? 12 : 2, 8);
    const n = integer(exam ? 6 : 2, 4);
    const x = integer(exam ? 10 : 2, 6);
    const [prompt, answer, errors = {}] = template(a,b,n,x,exam,level);
    return {id: `${exam ? "exam" : "practice"}-${id}-${level}-${a}-${b}-${n}-${x}`, concept:id, level,
      difficulty: Math.min(1, difficulty + (level === "far" ? .18 : level === "near" ? .1 : 0)),
      prompt, answer: String(answer),
      errors: Object.fromEntries(Object.entries(errors).map(([key,value]) => [key, String(value)]).filter(([,value]) => value !== String(answer)))};
  };
  return {id,name,description:instruction,type,prerequisites,
    related: definitions.filter(row => row[3].includes(id)).map(row => row[0]), transfer: prerequisites,
    difficulty, instruction, stability: index < 5 ? 25 : 1,
    examLevels: [
      {level: type === "procedural" ? "procedure" : "recall", count: 2},
      ...(["average","tangent"].includes(id) ? [{level:"near" as const,count:2}] : []),
      ...(id === "applications" ? [{level:"far" as const,count:3}] : []),
    ],
    misconceptions: rules.map(([misconception, rule]) => ({id:misconception, rule})), practice: generate(false), assessment: generate(true)};
});
const prior = {algebra:.64, exponents:.61, functions:.53, graphs:.48, slope:.5};
function profile(id: string, changes: Partial<Profile["params"]> = {}, knowledge: Profile["prior"] = prior, misconceptions = {}): Profile {
  return {id, params:{...defaults,...changes}, prior:{...knowledge}, misconceptions};
}
export const presets = [
  profile("The Forgetful Calculus Student"),
  profile("Complete beginner", {}, {}),
  profile("Highly forgetful", {halfLife:.75,forgetting:2}),
  profile("Weak prerequisites", {}, {algebra:.2,exponents:.2}),
  profile("Fast learner, poor retention", {learning:.66,halfLife:1}),
  profile("Slow learner, strong retention", {learning:.19,halfLife:12,forgetting:.65}),
  profile("Persistent misconceptions", {resistance:.85}, prior, {no_multiplier:.65,constant_identity:.6}),
  profile("Limited working memory", {capacity:1.2}),
  profile("Custom"),
];
