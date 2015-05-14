import { IError } from '../models/IError';
import { IParameter } from '../models/IParameter';
import { IErrorParser } from 'IErrorParser';
import { IStackFrame } from '../models/IStackFrame';
import { EventPluginContext } from '../plugins/EventPluginContext';

export class WebErrorParser implements IErrorParser {
  public parse(context:EventPluginContext, exception:Error): void {
    var stackTrace:TraceKit.StackTrace = !!context.contextData['@@_TraceKit.StackTrace']
      ? context.contextData['@@_TraceKit.StackTrace']
      : TraceKit.computeStackTrace(exception, 25);

    if (!stackTrace) {
      throw new Error('Unable to parse the exceptions stack trace.');
    }

    var error:IError = {
      type: stackTrace.name,
      message: stackTrace.message || exception.message,
      stack_trace: this.getStackFrames(context, stackTrace.stack || [])
    };

    context.event.data['@error'] = error;
  }

  private getStackFrames(context:EventPluginContext, stackFrames:TraceKit.StackFrame[]): IStackFrame[] {
    var frames:IStackFrame[] = [];

    for (var index = 0; index < stackFrames.length; index++) {
      var frame = stackFrames[index];
      frames.push({
        name: frame.func || '[anonymous]',
        parameters: this.getParameters(frame.args),
        file_name: frame.url,
        line_number: frame.line,
        column: frame.column
      });
    }

    return frames;
  }

  private getParameters(parameters:string|string[]): IParameter[] {
    var params:string[] = (typeof parameters === 'string' ? [parameters] : parameters) || [];

    var result:IParameter[] = [];
    for (var index = 0; index < params.length; index++) {
      result.push({ name: params[index] })
    }

    return result;
  }
}
