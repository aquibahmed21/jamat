// "Unsaved changes" flag for the form currently on screen. Set by the shared editor, cleared on save/leave/render.
let dirty = false;

export const isDirty = (): boolean => dirty;
export const setDirty = (value: boolean): void => { dirty = value; };
