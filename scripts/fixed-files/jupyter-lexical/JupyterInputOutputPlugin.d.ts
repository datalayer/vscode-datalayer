import { Kernel, OnSessionConnection } from '@datalayer/jupyter-react';
import { IOutput } from '@jupyterlab/nbformat';
export declare const INPUT_UUID_TO_OUTPUT_KEY: Map<string, string | undefined>;
export declare const INPUT_UUID_TO_CODE_KEY: Map<string, string | undefined>;
export declare const INPUT_UUID_TO_OUTPUT_UUID: Map<string, string | undefined>;
export declare const OUTPUT_UUID_TO_CODE_UUID: Map<string, string | undefined>;
export declare const OUTPUT_UUID_TO_OUTPUT_KEY: Map<string, string | undefined>;
export declare const DEFAULT_INITIAL_OUTPUTS: IOutput[];
export type JupyterInputOutputProps = {
    code: string;
    outputs?: IOutput[];
    loading?: string;
};
export type JupyterInputOutputPluginProps = {
    kernel?: Kernel;
    /**
     * Callback on session connection changed.
     */
    onSessionConnection?: OnSessionConnection;
};
export declare const INSERT_JUPYTER_INPUT_OUTPUT_COMMAND: import("lexical").LexicalCommand<JupyterInputOutputProps>;
/**
 * Command to execute the currently focused/selected Jupyter cell.
 * Dispatching this command will execute the code in the cell where the cursor is located.
 */
export declare const RUN_JUPYTER_CELL_COMMAND: import("lexical").LexicalCommand<void>;
/**
 * Command to execute all Jupyter cells in the document.
 * Dispatching this command will execute all cells in sequential order.
 */
export declare const RUN_ALL_JUPYTER_CELLS_COMMAND: import("lexical").LexicalCommand<void>;
/**
 * Command to restart the Jupyter kernel.
 * Dispatching this command will restart the kernel session.
 */
export declare const RESTART_JUPYTER_KERNEL_COMMAND: import("lexical").LexicalCommand<void>;
/**
 * Command to clear all outputs from all Jupyter cells in the document.
 * Dispatching this command will clear the outputs of all cells without affecting the code.
 */
export declare const CLEAR_ALL_OUTPUTS_COMMAND: import("lexical").LexicalCommand<void>;
export declare const JupyterInputOutputPlugin: (props?: JupyterInputOutputPluginProps) => null;
export default JupyterInputOutputPlugin;
