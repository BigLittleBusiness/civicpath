// DESIGN: Civic Field Manual — an editorial, route-led civic interface for regional council decision-makers.
import { Route, Switch } from "wouter";
import Home from "./pages/Home";
import Contact from "./pages/Contact";

export default function App() {
  return <Switch><Route path="/contact" component={Contact} /><Route component={Home} /></Switch>;
}
