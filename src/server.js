import { app, BUILD } from "./app.js";

const port = Number(process.env.PORT || 5173);
app.listen(port, () => {
  console.log(`EnrollmentNow ${BUILD} running at http://localhost:${port} (NODE_ENV=${process.env.NODE_ENV})`);
});
