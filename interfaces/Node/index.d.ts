/// <reference lib="esnext.disposable" />

/*
 * Type definitions for the CodeBase Node.js FFI bindings (index.js).
 *
 * The runtime module is CommonJS; these declarations describe its named exports.
 */

/** Options applied to a freshly initialized CODE4 (via code4compatibility/safety/errOff/readOnly). */
export interface Code4Options {
   compatibility?: number;
   safety?: number;
   errOff?: number;
   readOnly?: number;
}

/** A FIELD4INFO entry for {@link Code4.create}. `type` is a CodeBase type code (see r4type). */
export interface FieldDef {
   name: string;
   type: string | number;
   len?: number;
   dec?: number;
   nulls?: number;
}

/** A TAG4INFO entry for {@link Code4.create}. */
export interface TagDef {
   name: string;
   expression?: string;
   filter?: string;
   unique?: number;
   descending?: number;
}

/** r4success error code. */
export declare const r4success: 0;

/** CodeBase field type codes (char), mirroring interfaces/CSharp/Codebase.cs. */
export declare const r4type: {
   readonly bin: 'B';
   readonly double: 'B';
   readonly str: 'C';
   readonly date: 'D';
   readonly float: 'F';
   readonly gen: 'G';
   readonly int: 'I';
   readonly log: 'L';
   readonly memo: 'M';
   readonly num: 'N';
   readonly dateTime: 'T';
   readonly currency: 'Y';
};

/** Absolute path of the native library that was loaded. */
export declare const libraryPath: string;

/** File name of the native library selected for the current process bitness. */
export declare const dllName: string;

/**
 * Number of live CODE4 instances (code4numCodeBaseCount).
 * Returns `null` when the loaded engine does not export the diagnostic.
 */
export declare function numCodeBaseInstances(): number | null;

/** A field handle within an open data file. */
export declare class Field4 {
   /** Assign a string value (ANSI, via f4assignN). */
   assign(value: string | number): void;
   /** Assign a double value (via f4assignDouble). */
   assignDouble(value: number): void;
   /** Read the field as a string (via f4str). */
   str(): string;
   /** Read the field as a double (via f4double). */
   double(): number;
   /** Read the field as an integer (via f4int). */
   int(): number;
   /** Assign a memo value (via f4memoAssignN). */
   memoAssign(value: string): void;
   /** Read a memo value (via f4memoStr). */
   memoStr(): string;
   /** Length of the memo value (via f4memoLen). */
   memoLen(): number;
}

/** An open DATA4 (data file). */
export declare class Data4 {
   /** Opaque native DATA4 pointer. */
   readonly handle: bigint;
   isValid(): boolean;
   errorText(): string;
   appendStart(memo?: number): number;
   appendBlank(): number;
   field(name: string): Field4;
   go(recNo: number): number;
   seek(key: string): number;
   recCount(): number;
   numFields(): number;
   close(): number;
}

/** A CODE4 instance; the entry point to the engine. */
export declare class Code4 {
   constructor(options?: Code4Options);
   /** Opaque native CODE4 pointer. */
   readonly handle: bigint;
   /** Current error code (via code4errorCode). */
   readonly errorCode: number;
   /** Error description for `code` (or the current error). */
   errorText(code?: number): string;
   /** Open an existing data file. */
   open(name: string): Data4;
   /** Create a new data file with the given fields and optional tags. */
   create(name: string, fields: FieldDef[], tags?: TagDef[] | null): Data4;
   /** Release the CODE4 (code4initUndo). Idempotent. */
   dispose(): void;
   [Symbol.dispose](): void;
}

/** Raw koffi struct type for FIELD4INFO. */
export declare const Field4info: unknown;

/** Raw koffi struct type for TAG4INFO. */
export declare const Tag4info: unknown;

/** The koffi module instance used by the bindings. */
export declare const koffi: unknown;
