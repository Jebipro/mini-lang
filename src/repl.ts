import { LangError, formatError } from './errors.js';
import { classify } from './parser.js';
import { createSession, execute, type Session } from './runner.js';
import { SourceUnit } from './source-location.js';
import { formatValue } from './value-format.js';
export interface ReplPorts { writeOutput(text: string): void; writeDiagnostic(text: string): void; showPrompt(text: string): void }
export class Repl {
  private readonly session: Session;
  private lines: string[] = [];
  private sequence = 1;
  private sourceId: string | undefined;
  constructor(private readonly ports: ReplPorts) { this.session = createSession(text => ports.writeOutput(text)); ports.showPrompt('> '); }
  private source(): SourceUnit {
    const source = new SourceUnit(this.lines.join('\n'), `<repl:${this.sequence}>`, this.sourceId);
    this.sourceId = source.id;
    return source;
  }
  private clear(): void { this.lines = []; this.sourceId = undefined; this.sequence++; }
  submitLine(line: string): void {
    this.lines.push(line);
    const result = classify(this.source());
    if (result.kind === 'incomplete') { this.ports.showPrompt('... '); return; }
    this.clear();
    if (result.kind === 'invalid') this.ports.writeDiagnostic(formatError(result.error) + '\n');
    else if (result.kind === 'complete') {
      try { execute(result.program, this.session, value => { if (value.tag !== 'null') this.ports.writeOutput(formatValue(value) + '\n'); }); }
      catch (error) { if (error instanceof LangError) this.ports.writeDiagnostic(formatError(error) + '\n'); else throw error; }
    }
    this.ports.showPrompt('> ');
  }
  cancelInput(): void { this.clear(); this.ports.showPrompt('> '); }
  endInput(): number {
    if (this.lines.length === 0) return 0;
    const result = classify(this.source()); this.clear();
    if (result.kind !== 'complete') { this.ports.writeDiagnostic(formatError(result.error) + '\n'); return 1; }
    return 0;
  }
}
