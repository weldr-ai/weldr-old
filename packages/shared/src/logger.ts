import pino from "pino";
import pretty from "pino-pretty";

const isDevelopment = process.env.NODE_ENV === "development";

export namespace Logger {
  const baseLogger = pino(
    {
      level: process.env.LOG_LEVEL || "info",
    },
    isDevelopment ? pretty({ colorize: true, singleLine: true }) : undefined,
  );

  export const instance = baseLogger;

  export const debug = (message: string, data?: Record<string, unknown>) =>
    instance.debug(data || {}, message);

  export const error = (message: string, data?: Record<string, unknown>) =>
    instance.error(data || {}, message);

  export const fatal = (message: string, data?: Record<string, unknown>) =>
    instance.fatal(data || {}, message);

  export const info = (message: string, data?: Record<string, unknown>) =>
    instance.info(data || {}, message);

  export const trace = (message: string, data?: Record<string, unknown>) =>
    instance.trace(data || {}, message);

  export const warn = (message: string, data?: Record<string, unknown>) =>
    instance.warn(data || {}, message);

  export const get = (options?: Record<string, unknown>) => {
    const child = instance.child(options || {});

    return {
      info: (message: string, data?: Record<string, unknown>) => child.info(data || {}, message),
      error: (message: string, data?: Record<string, unknown>) => child.error(data || {}, message),
      fatal: (message: string, data?: Record<string, unknown>) => child.fatal(data || {}, message),
      trace: (message: string, data?: Record<string, unknown>) => child.trace(data || {}, message),
      warn: (message: string, data?: Record<string, unknown>) => child.warn(data || {}, message),
      debug: (message: string, data?: Record<string, unknown>) => child.debug(data || {}, message),
    };
  };
}
