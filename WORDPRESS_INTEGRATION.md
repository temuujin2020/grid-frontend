# Esports Matches Ticker for WordPress

This guide shows you how to integrate the rolling esports matches ticker into your WordPress website.

## 🎯 **Three Integration Methods**

### **Method 1: Direct HTML Embed (Recommended)**
Use the `wordpress-ticker.html` file for direct embedding in WordPress.

**Steps:**
1. Copy the entire content from `wordpress-ticker.html`
2. In WordPress, go to **Appearance > Widgets** or **Appearance > Customize > Widgets**
3. Add a **Custom HTML** widget
4. Paste the code into the widget
5. Save and publish

**Advantages:**
- No external files needed
- Works with any WordPress theme
- Self-contained with all styles and scripts

### **Method 2: Iframe Embed**
Use the `ticker-iframe.html` file for iframe embedding.

**Steps:**
1. Upload `ticker-iframe.html` to your WordPress media library or web server
2. In WordPress, add a **Custom HTML** widget
3. Use this code:
```html
<iframe 
    src="https://yourdomain.com/path/to/ticker-iframe.html" 
    width="100%" 
    height="60" 
    frameborder="0" 
    scrolling="no"
    style="border: none; overflow: hidden;">
</iframe>
```

**Advantages:**
- Completely isolated from your theme
- Easy to update by replacing the file
- No conflicts with existing CSS/JS

### **Method 3: Standalone Page**
Use the `esports-ticker.html` file as a standalone page.

**Steps:**
1. Upload `esports-ticker.html` to your WordPress root directory
2. Access it via `https://yourdomain.com/esports-ticker.html`
3. Embed using iframe or redirect

## 🎨 **Customization Options**

### **Height Adjustment**
To change the ticker height, modify this CSS property:
```css
height: 60px; /* Change to your preferred height */
```

### **Color Scheme**
To change colors, modify these CSS variables:
```css
background: linear-gradient(90deg, #0f141d, #0b111a); /* Background */
border-top: 2px solid #3b82f6; /* Top border */
border-bottom: 2px solid #3b82f6; /* Bottom border */
```

### **Animation Speed**
To change scroll speed, modify this JavaScript variable:
```javascript
const TICKER_SPEED = 60; // seconds for full scroll (lower = faster)
```

### **Refresh Rate**
To change how often data updates:
```javascript
const REFRESH_INTERVAL = 30000; // milliseconds (30000 = 30 seconds)
```

## 📱 **Responsive Design**

The ticker automatically adapts to different screen sizes:
- **Desktop**: Full height (60px) with larger text
- **Mobile**: Reduced height (50px) with smaller text
- **Tablet**: Optimized spacing and sizing

## 🔧 **WordPress-Specific Tips**

### **Theme Compatibility**
- Works with any WordPress theme
- Uses CSS prefixes to avoid conflicts
- Self-contained styles won't affect your site

### **Performance**
- Lightweight (minimal CSS/JS)
- Caches data for 30 seconds
- No external dependencies except the API

### **Security**
- No user input handling
- Read-only API calls
- Safe for production use

## 🚀 **Advanced Integration**

### **Custom Post Type Integration**
If you want to integrate with WordPress posts:

1. Create a custom post type for esports matches
2. Modify the JavaScript to fetch from WordPress REST API
3. Replace the PandaScore API calls with WordPress queries

### **Plugin Development**
To create a WordPress plugin:

1. Create a new plugin file
2. Use WordPress hooks and filters
3. Add admin settings for customization
4. Include the ticker code in a shortcode

### **Shortcode Integration**
Create a shortcode for easy placement:

```php
function esports_ticker_shortcode($atts) {
    // Include the ticker HTML here
    return $ticker_html;
}
add_shortcode('esports_ticker', 'esports_ticker_shortcode');
```

Then use `[esports_ticker]` anywhere in your content.

## 🐛 **Troubleshooting**

### **Common Issues:**

1. **Ticker not showing**: Check if your theme allows custom HTML widgets
2. **Styling conflicts**: The ticker uses prefixed CSS classes to avoid conflicts
3. **JavaScript errors**: Check browser console for any errors
4. **API issues**: The ticker will show "Unable to load matches" if the API is down

### **Browser Compatibility:**
- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 📊 **Features Included**

- ✅ Real-time match data from PandaScore API
- ✅ Live and upcoming matches
- ✅ CS2 and DOTA 2 support
- ✅ 12-hour AM/PM time format
- ✅ Responsive design
- ✅ Hover to pause animation
- ✅ Auto-refresh every 30 seconds
- ✅ Error handling
- ✅ Mobile-optimized
- ✅ No scroll bars
- ✅ Smooth scrolling animation

## 🔗 **API Information**

The ticker uses the PandaScore API through a proxy server:
- **Endpoint**: `https://grid-proxy.onrender.com`
- **Games**: CS2 and DOTA 2
- **Data**: Live and upcoming matches
- **Refresh**: Every 30 seconds

## 📞 **Support**

If you need help with integration:
1. Check the browser console for errors
2. Verify the API is accessible
3. Test with different WordPress themes
4. Ensure your hosting supports JavaScript execution

The ticker is designed to be robust and work across different WordPress configurations.

