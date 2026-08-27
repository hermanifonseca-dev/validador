export const logger = {
  info: (msg: string, ...args: any[]) => {
    const time = new Date().toISOString();
    console.log(`[\x1b[34mINFO\x1b[0m] [${time}] ${msg}`, ...args);
  },
  success: (msg: string, ...args: any[]) => {
    const time = new Date().toISOString();
    console.log(`[\x1b[32mSUCCESS\x1b[0m] [${time}] ${msg}`, ...args);
  },
  warn: (msg: string, ...args: any[]) => {
    const time = new Date().toISOString();
    console.warn(`[\x1b[33mWARN\x1b[0m] [${time}] ${msg}`, ...args);
  },
  error: (msg: string, ...args: any[]) => {
    const time = new Date().toISOString();
    console.error(`[\x1b[31mERROR\x1b[0m] [${time}] ${msg}`, ...args);
  },
  debug: (msg: string, ...args: any[]) => {
    if (process.env.NODE_ENV !== "production") {
      const time = new Date().toISOString();
      console.debug(`[\x1b[35mDEBUG\x1b[0m] [${time}] ${msg}`, ...args);
    }
  },
};
