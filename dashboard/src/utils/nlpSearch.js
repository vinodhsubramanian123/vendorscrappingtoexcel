import FlexSearch from 'flexsearch';

/**
 * Client-side SKU & Attribute NLP Indexer using FlexSearch
 */
class NlpCatalogIndexer {
  constructor() {
    this.index = new FlexSearch.Document({
      document: {
        id: 'sku',
        index: ['sku', 'description', 'parentCategory', 'subCategory', 'rules'],
        store: ['sku', 'description', 'parentCategory', 'subCategory', 'rules', 'optionType', 'listPrice']
      },
      tokenize: 'forward',
      cache: true
    });
    this.indexedCount = 0;
  }

  /**
   * Index a catalog payload
   * @param {Object} catalogJson 
   */
  indexCatalog(catalogJson) {
    if (!catalogJson || !catalogJson.entries) return;
    this.index = new FlexSearch.Document({
      document: {
        id: 'sku',
        index: ['sku', 'description', 'parentCategory', 'subCategory', 'rules'],
        store: true
      },
      tokenize: 'forward'
    });

    let count = 0;
    catalogJson.entries.forEach(entry => {
      if (entry.skus && Array.isArray(entry.skus)) {
        entry.skus.forEach(skuItem => {
          const doc = {
            sku: skuItem.sku || skuItem['Product #'] || skuItem.partNumber || `SKU-${count}`,
            description: skuItem.description || skuItem['Description'] || skuItem.name || '',
            parentCategory: entry.parentCategory || '',
            subCategory: entry.subCategory || '',
            rules: (entry.rules || []).join(' '),
            optionType: skuItem.optionType || skuItem['Option Type'] || skuItem.Type || 'CTO',
            listPrice: skuItem.listPrice || skuItem['Price (USD)'] || skuItem['List Price (USD)'] || skuItem['List Price'] || 'N/A'
          };
          this.index.add(doc);
          count++;
        });
      }
    });
    this.indexedCount = count;
  }

  /**
   * Perform client-side NLP attribute search
   * @param {string} query 
   * @returns {Array<Object>} Matches
   */
  search(query) {
    if (!query || !query.trim() || this.indexedCount === 0) return [];
    const results = this.index.search(query.trim(), { limit: 50, enrich: true });
    
    // Flatten FlexSearch results
    const resultMap = new Map();
    results.forEach(res => {
      res.result.forEach(item => {
        resultMap.set(item.id, item.doc);
      });
    });
    return Array.from(resultMap.values());
  }
}

export const catalogIndexer = new NlpCatalogIndexer();
