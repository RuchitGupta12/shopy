import React, { useEffect } from 'react';
import Product from '../components/Product';
import LoadingBox from '../components/LoadingBox';
import MessageBox from '../components/MessageBox';
import { useDispatch, useSelector } from 'react-redux';
import { listProducts, listProductCategories } from '../actions/productActions';
import { Link } from 'react-router-dom';

export default function HomeScreen() {
  const dispatch = useDispatch();
  const productList = useSelector((state) => state.productList);
  const { loading, error, products } = productList;

  const productCategoryList = useSelector((state) => state.productCategoryList);
  const {
    loading: loadingCategories,
    error: errorCategories,
    categories,
  } = productCategoryList;

  useEffect(() => {
    dispatch(listProducts({}));
    dispatch(listProductCategories());
  }, [dispatch]);

  // Top Brands to feature on home page
  const featuredBrands = [
    { name: 'Nike', logo: 'https://upload.wikimedia.org/wikipedia/commons/a/a6/Logo_NIKE.svg' },
    { name: 'Adidas', logo: 'https://upload.wikimedia.org/wikipedia/commons/2/20/Adidas_Logo.svg' },
    { name: 'Puma', logo: 'https://upload.wikimedia.org/wikipedia/en/2/22/Puma_Logo.svg' },
    { name: 'Zara', logo: 'https://upload.wikimedia.org/wikipedia/commons/f/fd/Zara_Logo.svg' },
    { name: 'H&M', logo: 'https://upload.wikimedia.org/wikipedia/commons/5/53/H%26M-Logo.svg' },
    { name: 'Gucci', logo: 'https://upload.wikimedia.org/wikipedia/commons/c/c5/Gucci_logo.svg' },
  ];

  return (
    <div className="home-container">
      
      {/* Featured Brands Banner */}
      <div className="brands-container">
        <h2 className="section-title">Top Brands</h2>
        <div className="brands-grid">
          {featuredBrands.map((brand, index) => (
             <Link to={`/search/name/${brand.name}`} key={index} className="brand-card">
               <img src={brand.logo} alt={brand.name} />
             </Link>
          ))}
        </div>
      </div>

      {loading ? (
        <LoadingBox></LoadingBox>
      ) : error ? (
        <MessageBox variant="danger">{error}</MessageBox>
      ) : (
        <>
          {products.length === 0 && <MessageBox>No Product Found</MessageBox>}
          
          <div className="products-container">
            <h2 className="section-title">Featured Products</h2>
            <div className="row center">
              {products.slice(0, 8).map((product) => (
                <Product key={product._id} product={product}></Product>
              ))}
            </div>
          </div>

          {!loadingCategories && !errorCategories && categories && categories.map((category) => {
             const categoryProducts = products.filter(p => p.category === category);
             if (categoryProducts.length === 0) return null;
             return (
               <div key={category} className="products-container category-section">
                 <h2 className="section-title">Shop {category}</h2>
                 <div className="row center">
                   {categoryProducts.slice(0, 8).map((product) => (
                     <Product key={product._id} product={product}></Product>
                   ))}
                 </div>
               </div>
             )
          })}
        </>
      )}
    </div>
  );
}
