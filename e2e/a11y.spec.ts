import AxeBuilder from '@axe-core/playwright';
import { test, expect } from '@playwright/test';
import {makePdf} from './fixtures';

const routes=['/','/checker','/pricing','/workspace','/guides','/privacy'];
for (const route of routes) {
  test('automated accessibility scan: '+route,async({page})=>{
    await page.goto(route);
    await page.waitForTimeout(500); // finish entrance animation before contrast measurements
    const report=await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
    const serious=report.violations.filter(v=>v.impact==='critical'||v.impact==='serious');
    const formatted=serious.map(v=>({id:v.id,impact:v.impact,description:v.description,affected:v.nodes.map(n=>({selector:n.target,summary:n.failureSummary}))}));
    expect(formatted,JSON.stringify(formatted,null,2)).toEqual([]);
  });
}

test('the public interface requests no third-party webfonts',async({page})=>{
  const externalFonts:string[]=[];
  page.on('request',request=>{
    const url=request.url();
    if(url.startsWith('https://fonts.googleapis.com')||url.startsWith('https://fonts.gstatic.com'))externalFonts.push(url);
  });
  await page.goto('/');
  await page.evaluate(async()=>{await document.fonts.ready;});
  expect(externalFonts).toEqual([]);
});

test('real inspection workspace and editing controls have no serious automated accessibility violations',async({page})=>{
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'accessible-lecture.pdf',mimeType:'application/pdf',
    buffer:makePdf(['Accessible classroom handout with measurable and editable content.']),
  });
  await expect(page.getByRole('heading',{name:'accessible-lecture.pdf'})).toBeVisible({timeout:30000});
  await page.getByRole('tab',{name:'Edit text'}).click();
  await expect(page.getByLabel('Extracted text').first()).toBeVisible();
  await page.waitForTimeout(500);
  const result=await new AxeBuilder({page})
    .withTags(['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']).analyze();
  const serious=result.violations.filter(v=>v.impact==='critical'||v.impact==='serious');
  expect(serious.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>n.target)}))).toEqual([]);
});
