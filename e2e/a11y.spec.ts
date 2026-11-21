import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';

const routes=['/','/checker','/pricing','/workspace','/guides','/privacy'];
for (const route of routes) {
  test('automated accessibility scan: '+route,async({page})=>{
    await page.goto(route);
    const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    const serious=report.violations.filter(v=>v.impact==='critical'||v.impact==='serious');
    const formatted=serious.map(v=>({id:v.id,impact:v.impact,description:v.description,affected:v.nodes.map(n=>({selector:n.target,summary:n.failureSummary}))}));
    expect(formatted,JSON.stringify(formatted,null,2)).toEqual([]);
  });
}
