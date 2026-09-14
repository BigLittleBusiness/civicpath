import { configureStore, createSlice } from '@reduxjs/toolkit';

const workspaceSlice = createSlice({
  name: 'workspace',
  initialState: { organisation: 'CivicPath Demonstration Council', isDemo: true, period: 'This financial year' },
  reducers: {
    setPeriod: (state, action) => { state.period = action.payload; },
    setWorkspace: (state, action) => Object.assign(state, action.payload),
  },
});

export const { setPeriod, setWorkspace } = workspaceSlice.actions;
export const store = configureStore({ reducer: { workspace: workspaceSlice.reducer } });

