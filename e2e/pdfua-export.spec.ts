import {test,expect} from '@playwright/test';
import {makeStyledPdf} from './fixtures';
import {copyFile,mkdir,stat} from 'node:fs/promises';
import path from 'node:path';

const folder=path.resolve('pdfua-artifacts/generated');

test('produce real tagged PDF export specimens for independent PDF/UA validation',async({page})=>{
  await mkdir(folder,{recursive:true});
  await page.goto('/checker');
  await page.locator('input[type=file]').setInputFiles({
    name:'biology-sample.pdf',mimeType:'application/pdf',buffer:makeStyledPdf()
  });
  await expect(page.getByRole('heading',{name:'biology-sample.pdf'})).toBeVisible({timeout:30000});
  await page.getByRole('tab',{name:'Edit text'}).click();
  async function exportPdf(name:string){
    const pending=page.waitForEvent('download');
    await page.getByRole('button',{name:/Download tagged PDF/}).click();
    const file=await pending;
    const source=await file.path();
    if(!source)throw new Error('Generated PDF not retained by Playwright');
    await copyFile(source,path.join(folder,name));
  }
  await exportPdf('reading-basic.pdf');
  await page.getByRole('button',{name:'Add table'}).click();
  await page.getByLabel('Tab-separated table (first row is headers)').fill('Subject\tScore\nBiology\t95\nPhysics\t90');
  await page.getByLabel('Table caption').fill('University laboratory assessment');
  await page.getByRole('button',{name:'Add equation'}).click();
  await page.getByLabel('LaTeX equation').fill('x^2+y^2=z^2');
  await page.getByLabel('Spoken explanation of the mathematics').fill('The sum of two squared values equals the third squared value.');
  await exportPdf('reading-stem.pdf');
  for(const name of ['reading-basic.pdf','reading-stem.pdf']){
    expect((await stat(path.join(folder,name))).size).toBeGreaterThan(1000);
  }
});
